const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// 所有路由都需要认证
router.use(authenticate);

// 获取狗狗列表（需要查看权限）
router.get('/', requirePermission('can_view'), auditLog('list_dogs', 'dogs'), async (req, res) => {
  try {
    const {
      search,
      status,
      owner,
      phone,
      page = 1,
      limit = 20
    } = req.query;

    const offset = (page - 1) * limit;

    let query = `
      SELECT
        d.*,
        u.name as created_by_name
      FROM dogs d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.store_id = ?
    `;
    const params = [req.storeId];

    // 搜索条件
    if (search) {
      query += ' AND (d.name LIKE ? OR d.breed LIKE ? OR d.owner LIKE ? OR d.phone LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      query += ' AND d.status = ?';
      params.push(status);
    }

    if (owner) {
      query += ' AND d.owner LIKE ?';
      params.push(`%${owner}%`);
    }

    if (phone) {
      query += ' AND d.phone LIKE ?';
      params.push(`%${phone}%`);
    }

    // 总数查询
    const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
    const countResult = await db.get(countQuery, params);

    // 分页查询
    query += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const dogs = await db.query(query, params);

    // 获取每只狗狗的预约状态
    for (const dog of dogs) {
      const booking = await db.get(
        `SELECT status, check_in_time, check_out_time
         FROM bookings
         WHERE dog_id = ? AND status = 'active'
         ORDER BY check_in_time DESC LIMIT 1`,
        [dog.id]
      );

      dog.has_booking = !!booking;
      if (booking) {
        dog.current_booking = booking;
      }
    }

    res.json({
      success: true,
      data: dogs,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('获取狗狗列表错误:', error);
    res.status(500).json({
      error: '获取狗狗列表失败',
      code: 'GET_DOGS_ERROR'
    });
  }
});

// 获取单个狗狗信息
router.get('/:id', requirePermission('can_view'), auditLog('view_dog', 'dogs', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;

    const dog = await db.get(
      `SELECT
        d.*,
        u.name as created_by_name
       FROM dogs d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.id = ? AND d.store_id = ?`,
      [id, req.storeId]
    );

    if (!dog) {
      return res.status(404).json({
        error: '狗狗档案不存在',
        code: 'DOG_NOT_FOUND'
      });
    }

    // 获取当前预约信息
    const booking = await db.get(
      `SELECT
        b.*,
        r.number as room_number,
        r.type as room_type
       FROM bookings b
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE b.dog_id = ? AND b.status = 'active'
       ORDER BY b.check_in_time DESC LIMIT 1`,
      [id]
    );

    if (booking) {
      dog.current_booking = booking;
    }

    // 获取历史预约
    const history = await db.query(
      `SELECT
        b.*,
        r.number as room_number,
        r.type as room_type
       FROM bookings b
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE b.dog_id = ? AND b.status != 'active'
       ORDER BY b.check_in_time DESC`,
      [id]
    );

    dog.booking_history = history;

    res.json({
      success: true,
      data: dog
    });
  } catch (error) {
    console.error('获取狗狗信息错误:', error);
    res.status(500).json({
      error: '获取狗狗信息失败',
      code: 'GET_DOG_ERROR'
    });
  }
});

// 创建狗狗档案（需要创建权限）
router.post('/', requirePermission('can_create'), auditLog('create_dog', 'dogs'), async (req, res) => {
  try {
    const {
      name,
      breed,
      age,
      gender,
      weight,
      vaccinated,
      neutered,
      dewormed,
      bites_people,
      bites_dogs,
      illnesses,
      special_notes,
      owner,
      phone
    } = req.body;

    // 验证必填字段
    if (!name || !owner || !phone) {
      return res.status(400).json({
        error: '狗狗名字、主人姓名和电话为必填项',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // 插入狗狗档案
    const result = await db.run(
      `INSERT INTO dogs
       (name, breed, age, gender, weight, vaccinated, neutered, dewormed,
        bites_people, bites_dogs, illnesses, special_notes, owner, phone,
        status, created_by, store_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        breed || null,
        age || null,
        gender || 'unknown',
        weight || null,
        vaccinated ? 1 : 0,
        neutered ? 1 : 0,
        dewormed ? 1 : 0,
        bites_people ? 1 : 0,
        bites_dogs ? 1 : 0,
        illnesses || null,
        special_notes || null,
        owner,
        phone,
        'available', // 默认状态
        req.userId,
        req.storeId
      ]
    );

    // 获取创建的狗狗档案
    const newDog = await db.get(
      `SELECT * FROM dogs WHERE id = ?`,
      [result.lastID]
    );

    res.status(201).json({
      success: true,
      message: '狗狗档案创建成功',
      data: newDog
    });
  } catch (error) {
    console.error('创建狗狗档案错误:', error);
    res.status(500).json({
      error: '创建狗狗档案失败',
      code: 'CREATE_DOG_ERROR'
    });
  }
});

// 更新狗狗档案（需要编辑权限）
router.put('/:id', requirePermission('can_edit'), auditLog('update_dog', 'dogs', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // 检查狗狗是否存在且属于当前门店
    const existingDog = await db.get(
      'SELECT id FROM dogs WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!existingDog) {
      return res.status(404).json({
        error: '狗狗档案不存在',
        code: 'DOG_NOT_FOUND'
      });
    }

    // 构建更新字段
    const allowedFields = [
      'name', 'breed', 'age', 'gender', 'weight',
      'vaccinated', 'neutered', 'dewormed',
      'bites_people', 'bites_dogs', 'illnesses',
      'special_notes', 'owner', 'phone', 'status'
    ];

    const updates = [];
    const params = [];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (typeof updateData[field] === 'boolean') {
          params.push(updateData[field] ? 1 : 0);
        } else {
          params.push(updateData[field]);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: '没有提供更新字段',
        code: 'NO_UPDATES'
      });
    }

    updates.push('updated_at = datetime("now")');
    params.push(id, req.storeId);

    const query = `UPDATE dogs SET ${updates.join(', ')} WHERE id = ? AND store_id = ?`;
    await db.run(query, params);

    // 获取更新后的狗狗档案
    const updatedDog = await db.get(
      `SELECT * FROM dogs WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: '狗狗档案更新成功',
      data: updatedDog
    });
  } catch (error) {
    console.error('更新狗狗档案错误:', error);
    res.status(500).json({
      error: '更新狗狗档案失败',
      code: 'UPDATE_DOG_ERROR'
    });
  }
});

// 删除狗狗档案（需要删除权限）
router.delete('/:id', requirePermission('can_delete'), auditLog('delete_dog', 'dogs', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;

    // 检查狗狗是否存在且属于当前门店
    const existingDog = await db.get(
      `SELECT id, name FROM dogs WHERE id = ? AND store_id = ?`,
      [id, req.storeId]
    );

    if (!existingDog) {
      return res.status(404).json({
        error: '狗狗档案不存在',
        code: 'DOG_NOT_FOUND'
      });
    }

    // 检查是否有活跃的预约
    const activeBooking = await db.get(
      `SELECT id FROM bookings WHERE dog_id = ? AND status = 'active'`,
      [id]
    );

    if (activeBooking) {
      return res.status(400).json({
        error: '该狗狗有活跃的预约，不能删除',
        code: 'DOG_HAS_ACTIVE_BOOKING'
      });
    }

    // 删除狗狗档案
    await db.run(
      'DELETE FROM dogs WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: '狗狗档案删除成功'
    });
  } catch (error) {
    console.error('删除狗狗档案错误:', error);
    res.status(500).json({
      error: '删除狗狗档案失败',
      code: 'DELETE_DOG_ERROR'
    });
  }
});

// 批量导入狗狗档案（需要创建权限）
router.post('/batch-import', requirePermission('can_create'), auditLog('batch_import_dogs', 'dogs'), async (req, res) => {
  try {
    const { dogs } = req.body;

    if (!Array.isArray(dogs) || dogs.length === 0) {
      return res.status(400).json({
        error: '需要提供狗狗档案数组',
        code: 'INVALID_INPUT'
      });
    }

    // 限制一次导入数量
    if (dogs.length > 100) {
      return res.status(400).json({
        error: '一次最多导入100条记录',
        code: 'IMPORT_LIMIT_EXCEEDED'
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // 逐条导入
    for (let i = 0; i < dogs.length; i++) {
      const dog = dogs[i];

      try {
        // 验证必填字段
        if (!dog.name || !dog.owner || !dog.phone) {
          results.failed++;
          results.errors.push({
            index: i,
            error: '狗狗名字、主人姓名和电话为必填项'
          });
          continue;
        }

        // 插入数据库
        await db.run(
          `INSERT INTO dogs
           (name, breed, age, gender, weight, vaccinated, neutered, dewormed,
            bites_people, bites_dogs, illnesses, special_notes, owner, phone,
            status, created_by, store_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dog.name,
            dog.breed || null,
            dog.age || null,
            dog.gender || 'unknown',
            dog.weight || null,
            dog.vaccinated ? 1 : 0,
            dog.neutered ? 1 : 0,
            dog.dewormed ? 1 : 0,
            dog.bites_people ? 1 : 0,
            dog.bites_dogs ? 1 : 0,
            dog.illnesses || null,
            dog.special_notes || null,
            dog.owner,
            dog.phone,
            dog.status || 'available',
            req.userId,
            req.storeId
          ]
        );

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          index: i,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `批量导入完成，成功 ${results.success} 条，失败 ${results.failed} 条`,
      data: results
    });
  } catch (error) {
    console.error('批量导入狗狗档案错误:', error);
    res.status(500).json({
      error: '批量导入失败',
      code: 'BATCH_IMPORT_ERROR'
    });
  }
});

module.exports = router;
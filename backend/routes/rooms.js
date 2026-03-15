const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// 所有路由都需要认证
router.use(authenticate);

// 获取房间列表（需要查看权限）
router.get('/', requirePermission('can_view'), auditLog('list_rooms', 'rooms'), async (req, res) => {
  try {
    const {
      type,
      status,
      available_only,
      page = 1,
      limit = 50
    } = req.query;

    const offset = (page - 1) * limit;

    let query = `
      SELECT
        r.*,
        COUNT(b.id) as active_bookings
      FROM rooms r
      LEFT JOIN bookings b ON r.id = b.room_id AND b.status = 'active'
      WHERE r.store_id = ?
    `;
    const params = [req.storeId];

    if (type) {
      query += ' AND r.type = ?';
      params.push(type);
    }

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }

    // 分组
    query += ' GROUP BY r.id';

    // 只显示可用房间
    if (available_only === 'true') {
      query += ' HAVING r.status = "available"';
    }

    // 总数查询
    const countQuery = query.replace(/SELECT r\.\*, COUNT\(b\.id\) as active_bookings/, 'SELECT COUNT(DISTINCT r.id) as total');
    const countResult = await db.get(countQuery, params);

    // 分页查询
    query += ' ORDER BY r.number ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const rooms = await db.query(query, params);

    // 获取每个房间的当前预约信息
    for (const room of rooms) {
      if (room.active_bookings > 0) {
        const currentBooking = await db.get(
          `SELECT
            b.*,
            d.name as dog_name,
            d.owner as dog_owner
           FROM bookings b
           LEFT JOIN dogs d ON b.dog_id = d.id
           WHERE b.room_id = ? AND b.status = 'active'
           ORDER BY b.check_in_time DESC LIMIT 1`,
          [room.id]
        );

        if (currentBooking) {
          room.current_booking = currentBooking;
        }
      }
    }

    res.json({
      success: true,
      data: rooms,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('获取房间列表错误:', error);
    res.status(500).json({
      error: '获取房间列表失败',
      code: 'GET_ROOMS_ERROR'
    });
  }
});

// 获取单个房间信息
router.get('/:id', requirePermission('can_view'), auditLog('view_room', 'rooms', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;

    const room = await db.get(
      `SELECT
        r.*,
        COUNT(b.id) as active_bookings
       FROM rooms r
       LEFT JOIN bookings b ON r.id = b.room_id AND b.status = 'active'
       WHERE r.id = ? AND r.store_id = ?
       GROUP BY r.id`,
      [id, req.storeId]
    );

    if (!room) {
      return res.status(404).json({
        error: '房间不存在',
        code: 'ROOM_NOT_FOUND'
      });
    }

    // 获取当前预约信息
    if (room.active_bookings > 0) {
      const currentBooking = await db.get(
        `SELECT
          b.*,
          d.name as dog_name,
          d.owner as dog_owner,
          d.phone as dog_phone
         FROM bookings b
         LEFT JOIN dogs d ON b.dog_id = d.id
         WHERE b.room_id = ? AND b.status = 'active'
         ORDER BY b.check_in_time DESC LIMIT 1`,
        [id]
      );

      if (currentBooking) {
        room.current_booking = currentBooking;
      }
    }

    // 获取房间历史预约
    const bookingHistory = await db.query(
      `SELECT
        b.*,
        d.name as dog_name,
        d.owner as dog_owner
       FROM bookings b
       LEFT JOIN dogs d ON b.dog_id = d.id
       WHERE b.room_id = ? AND b.status != 'active'
       ORDER BY b.check_in_time DESC
       LIMIT 20`,
      [id]
    );

    room.booking_history = bookingHistory;

    res.json({
      success: true,
      data: room
    });
  } catch (error) {
    console.error('获取房间信息错误:', error);
    res.status(500).json({
      error: '获取房间信息失败',
      code: 'GET_ROOM_ERROR'
    });
  }
});

// 创建房间（需要创建权限）
router.post('/', requirePermission('can_create'), auditLog('create_room', 'rooms'), async (req, res) => {
  try {
    const {
      number,
      type,
      size,
      price_per_day,
      description
    } = req.body;

    // 验证必填字段
    if (!number || !type || !price_per_day) {
      return res.status(400).json({
        error: '房间号、类型和每日价格为必填项',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // 验证类型
    const allowedTypes = ['standard', 'deluxe', 'vip'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        error: `房间类型必须是以下之一: ${allowedTypes.join(', ')}`,
        code: 'INVALID_ROOM_TYPE'
      });
    }

    // 检查房间号是否已存在
    const existingRoom = await db.get(
      'SELECT id FROM rooms WHERE number = ? AND store_id = ?',
      [number, req.storeId]
    );

    if (existingRoom) {
      return res.status(400).json({
        error: '该房间号已存在',
        code: 'ROOM_NUMBER_EXISTS'
      });
    }

    // 插入房间
    const result = await db.run(
      `INSERT INTO rooms
       (number, type, size, price_per_day, description, status, store_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        number,
        type,
        size || null,
        price_per_day,
        description || null,
        'available', // 默认状态
        req.storeId
      ]
    );

    // 获取创建的房间
    const newRoom = await db.get(
      `SELECT * FROM rooms WHERE id = ?`,
      [result.lastID]
    );

    res.status(201).json({
      success: true,
      message: '房间创建成功',
      data: newRoom
    });
  } catch (error) {
    console.error('创建房间错误:', error);
    res.status(500).json({
      error: '创建房间失败',
      code: 'CREATE_ROOM_ERROR'
    });
  }
});

// 更新房间信息（需要编辑权限）
router.put('/:id', requirePermission('can_edit'), auditLog('update_room', 'rooms', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // 检查房间是否存在且属于当前门店
    const existingRoom = await db.get(
      'SELECT id, number FROM rooms WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!existingRoom) {
      return res.status(404).json({
        error: '房间不存在',
        code: 'ROOM_NOT_FOUND'
      });
    }

    // 如果更新房间号，检查是否重复
    if (updateData.number && updateData.number !== existingRoom.number) {
      const duplicateRoom = await db.get(
        'SELECT id FROM rooms WHERE number = ? AND store_id = ? AND id != ?',
        [updateData.number, req.storeId, id]
      );

      if (duplicateRoom) {
        return res.status(400).json({
          error: '该房间号已存在',
          code: 'ROOM_NUMBER_EXISTS'
        });
      }
    }

    // 构建更新字段
    const allowedFields = [
      'number', 'type', 'size', 'price_per_day',
      'description', 'status'
    ];

    const updates = [];
    const params = [];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(updateData[field]);
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

    const query = `UPDATE rooms SET ${updates.join(', ')} WHERE id = ? AND store_id = ?`;
    await db.run(query, params);

    // 获取更新后的房间
    const updatedRoom = await db.get(
      `SELECT * FROM rooms WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: '房间更新成功',
      data: updatedRoom
    });
  } catch (error) {
    console.error('更新房间错误:', error);
    res.status(500).json({
      error: '更新房间失败',
      code: 'UPDATE_ROOM_ERROR'
    });
  }
});

// 删除房间（需要删除权限）
router.delete('/:id', requirePermission('can_delete'), auditLog('delete_room', 'rooms', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;

    // 检查房间是否存在且属于当前门店
    const existingRoom = await db.get(
      'SELECT id, number FROM rooms WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!existingRoom) {
      return res.status(404).json({
        error: '房间不存在',
        code: 'ROOM_NOT_FOUND'
      });
    }

    // 检查房间是否有活跃预约
    const activeBooking = await db.get(
      `SELECT id FROM bookings WHERE room_id = ? AND status = 'active'`,
      [id]
    );

    if (activeBooking) {
      return res.status(400).json({
        error: '房间有活跃的预约，不能删除',
        code: 'ROOM_HAS_ACTIVE_BOOKING'
      });
    }

    // 删除房间
    await db.run(
      'DELETE FROM rooms WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: '房间删除成功'
    });
  } catch (error) {
    console.error('删除房间错误:', error);
    res.status(500).json({
      error: '删除房间失败',
      code: 'DELETE_ROOM_ERROR'
    });
  }
});

// 查询空闲房间
router.post('/available', requirePermission('can_view'), auditLog('query_available_rooms', 'rooms'), async (req, res) => {
  try {
    const {
      check_in_date,
      check_out_date,
      room_type,
      ignore_booking_id = null
    } = req.body;

    // 验证输入
    if (!check_in_date || !check_out_date) {
      return res.status(400).json({
        error: '入住日期和离店日期为必填项',
        code: 'MISSING_DATES'
      });
    }

    const checkIn = new Date(check_in_date);
    const checkOut = new Date(check_out_date);

    if (checkIn >= checkOut) {
      return res.status(400).json({
        error: '离店日期必须晚于入住日期',
        code: 'INVALID_DATE_RANGE'
      });
    }

    // 构建查询
    let query = `
      SELECT
        r.*
      FROM rooms r
      WHERE r.store_id = ?
        AND r.status = 'available'
    `;
    const params = [req.storeId];

    if (room_type) {
      query += ' AND r.type = ?';
      params.push(room_type);
    }

    // 排除有冲突预约的房间
    query += ` AND r.id NOT IN (
      SELECT DISTINCT b.room_id
      FROM bookings b
      WHERE b.status = 'active'
        AND (
          (b.check_in_time < ? AND b.check_out_time > ?)
          OR (b.check_in_time < ? AND b.check_out_time > ?)
          OR (b.check_in_time >= ? AND b.check_out_time <= ?)
        )
    )`;

    // 添加日期参数
    params.push(checkOut, checkIn, checkIn, checkOut, checkIn, checkOut);

    // 如果忽略某个预约（用于修改预约）
    if (ignore_booking_id) {
      query += ` AND r.id NOT IN (
        SELECT room_id FROM bookings WHERE id = ? AND status = 'active'
      )`;
      params.push(ignore_booking_id);
    }

    query += ' ORDER BY r.number ASC';

    const availableRooms = await db.query(query, params);

    res.json({
      success: true,
      data: availableRooms,
      count: availableRooms.length
    });
  } catch (error) {
    console.error('查询空闲房间错误:', error);
    res.status(500).json({
      error: '查询空闲房间失败',
      code: 'QUERY_AVAILABLE_ROOMS_ERROR'
    });
  }
});

// 批量更新房间状态
router.post('/batch-update-status', requirePermission('can_edit'), auditLog('batch_update_room_status', 'rooms'), async (req, res) => {
  try {
    const { room_ids, status } = req.body;

    if (!Array.isArray(room_ids) || room_ids.length === 0 || !status) {
      return res.status(400).json({
        error: '需要提供房间ID数组和状态',
        code: 'INVALID_INPUT'
      });
    }

    // 验证状态
    const allowedStatuses = ['available', 'occupied', 'maintenance'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: `状态必须是以下之一: ${allowedStatuses.join(', ')}`,
        code: 'INVALID_STATUS'
      });
    }

    // 检查所有房间是否都属于当前门店
    const placeholders = room_ids.map(() => '?').join(',');
    const rooms = await db.query(
      `SELECT id FROM rooms WHERE id IN (${placeholders}) AND store_id = ?`,
      [...room_ids, req.storeId]
    );

    if (rooms.length !== room_ids.length) {
      return res.status(400).json({
        error: '部分房间不存在或不属于当前门店',
        code: 'INVALID_ROOM_IDS'
      });
    }

    // 批量更新
    await db.run(
      `UPDATE rooms SET status = ?, updated_at = datetime('now')
       WHERE id IN (${placeholders})`,
      [status, ...room_ids]
    );

    res.json({
      success: true,
      message: `已更新 ${room_ids.length} 个房间的状态为 ${status}`
    });
  } catch (error) {
    console.error('批量更新房间状态错误:', error);
    res.status(500).json({
      error: '批量更新房间状态失败',
      code: 'BATCH_UPDATE_ROOM_STATUS_ERROR'
    });
  }
});

module.exports = router;
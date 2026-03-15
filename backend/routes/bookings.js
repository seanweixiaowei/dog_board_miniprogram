const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// 所有路由都需要认证
router.use(authenticate);

// 获取预约列表（需要查看权限）
router.get('/', requirePermission('can_view'), auditLog('list_bookings', 'bookings'), async (req, res) => {
  try {
    const {
      status,
      dog_id,
      room_id,
      date_range,
      page = 1,
      limit = 20
    } = req.query;

    const offset = (page - 1) * limit;

    let query = `
      SELECT
        b.*,
        d.name as dog_name,
        d.owner as dog_owner,
        d.phone as dog_phone,
        r.number as room_number,
        r.type as room_type,
        u.name as created_by_name
      FROM bookings b
      LEFT JOIN dogs d ON b.dog_id = d.id
      LEFT JOIN rooms r ON b.room_id = r.id
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.store_id = ?
    `;
    const params = [req.storeId];

    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }

    if (dog_id) {
      query += ' AND b.dog_id = ?';
      params.push(dog_id);
    }

    if (room_id) {
      query += ' AND b.room_id = ?';
      params.push(room_id);
    }

    if (date_range) {
      const [startDate, endDate] = date_range.split(',');
      if (startDate && endDate) {
        query += ' AND b.check_in_time >= ? AND b.check_out_time <= ?';
        params.push(startDate, endDate);
      }
    }

    // 总数查询
    const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
    const countResult = await db.get(countQuery, params);

    // 分页查询
    query += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const bookings = await db.query(query, params);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('获取预约列表错误:', error);
    res.status(500).json({
      error: '获取预约列表失败',
      code: 'GET_BOOKINGS_ERROR'
    });
  }
});

// 获取单个预约信息
router.get('/:id', requirePermission('can_view'), auditLog('view_booking', 'bookings', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await db.get(
      `SELECT
        b.*,
        d.name as dog_name,
        d.breed as dog_breed,
        d.age as dog_age,
        d.gender as dog_gender,
        d.owner as dog_owner,
        d.phone as dog_phone,
        d.vaccinated as dog_vaccinated,
        d.neutered as dog_neutered,
        d.dewormed as dog_dewormed,
        d.bites_people as dog_bites_people,
        d.bites_dogs as dog_bites_dogs,
        d.illnesses as dog_illnesses,
        d.special_notes as dog_special_notes,
        r.number as room_number,
        r.type as room_type,
        r.price_per_day as room_price,
        u.name as created_by_name
       FROM bookings b
       LEFT JOIN dogs d ON b.dog_id = d.id
       LEFT JOIN rooms r ON b.room_id = r.id
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.id = ? AND b.store_id = ?`,
      [id, req.storeId]
    );

    if (!booking) {
      return res.status(404).json({
        error: '预约不存在',
        code: 'BOOKING_NOT_FOUND'
      });
    }

    // 计算总金额和已住天数
    const checkInTime = new Date(booking.check_in_time);
    const checkOutTime = new Date(booking.check_out_time);
    const now = new Date();

    // 计算预订天数
    const nights = Math.ceil((checkOutTime - checkInTime) / (1000 * 60 * 60 * 24));
    booking.nights = nights;
    booking.total_amount = nights * booking.room_price;

    // 如果已入住，计算已住天数
    if (booking.actual_check_in) {
      const actualCheckIn = new Date(booking.actual_check_in);
      const elapsedNights = Math.floor((now - actualCheckIn) / (1000 * 60 * 60 * 24));
      booking.elapsed_nights = Math.min(elapsedNights, nights);
      booking.remaining_nights = Math.max(0, nights - elapsedNights);
    }

    res.json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('获取预约信息错误:', error);
    res.status(500).json({
      error: '获取预约信息失败',
      code: 'GET_BOOKING_ERROR'
    });
  }
});

// 创建预约（需要创建权限）
router.post('/', requirePermission('can_create'), auditLog('create_booking', 'bookings'), async (req, res) => {
  try {
    const {
      dog_id,
      room_id,
      check_in_time,
      check_out_time,
      special_requirements,
      notes
    } = req.body;

    // 验证必填字段
    if (!dog_id || !room_id || !check_in_time || !check_out_time) {
      return res.status(400).json({
        error: '狗狗、房间、入住时间和离店时间为必填项',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const checkIn = new Date(check_in_time);
    const checkOut = new Date(check_out_time);

    if (checkIn >= checkOut) {
      return res.status(400).json({
        error: '离店时间必须晚于入住时间',
        code: 'INVALID_TIME_RANGE'
      });
    }

    // 检查狗狗是否存在且属于当前门店
    const dog = await db.get(
      'SELECT id, name FROM dogs WHERE id = ? AND store_id = ?',
      [dog_id, req.storeId]
    );

    if (!dog) {
      return res.status(404).json({
        error: '狗狗不存在',
        code: 'DOG_NOT_FOUND'
      });
    }

    // 检查房间是否存在且属于当前门店
    const room = await db.get(
      'SELECT id, number, price_per_day FROM rooms WHERE id = ? AND store_id = ?',
      [room_id, req.storeId]
    );

    if (!room) {
      return res.status(404).json({
        error: '房间不存在',
        code: 'ROOM_NOT_FOUND'
      });
    }

    // 检查房间是否可用（在时间范围内没有冲突预约）
    const conflictingBooking = await db.get(
      `SELECT id FROM bookings
       WHERE room_id = ? AND status = 'active'
         AND (
           (check_in_time < ? AND check_out_time > ?)
           OR (check_in_time < ? AND check_out_time > ?)
           OR (check_in_time >= ? AND check_out_time <= ?)
         )`,
      [room_id, checkOut, checkIn, checkIn, checkOut, checkIn, checkOut]
    );

    if (conflictingBooking) {
      return res.status(400).json({
        error: '该房间在指定时间范围内已被预约',
        code: 'ROOM_NOT_AVAILABLE'
      });
    }

    // 检查狗狗是否有冲突预约
    const dogConflictingBooking = await db.get(
      `SELECT id FROM bookings
       WHERE dog_id = ? AND status = 'active'
         AND (
           (check_in_time < ? AND check_out_time > ?)
           OR (check_in_time < ? AND check_out_time > ?)
         )`,
      [dog_id, checkOut, checkIn, checkIn, checkOut]
    );

    if (dogConflictingBooking) {
      return res.status(400).json({
        error: '该狗狗在指定时间范围内已有预约',
        code: 'DOG_ALREADY_BOOKED'
      });
    }

    // 计算总金额
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    const totalAmount = nights * room.price_per_day;

    // 创建预约
    const result = await db.run(
      `INSERT INTO bookings
       (dog_id, room_id, check_in_time, check_out_time,
        total_amount, special_requirements, notes,
        status, created_by, store_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dog_id,
        room_id,
        check_in_time,
        check_out_time,
        totalAmount,
        special_requirements || null,
        notes || null,
        'active',
        req.userId,
        req.storeId
      ]
    );

    // 更新狗狗状态为已预约
    await db.run(
      'UPDATE dogs SET status = "reserved", updated_at = datetime("now") WHERE id = ?',
      [dog_id]
    );

    // 获取创建的预约
    const newBooking = await db.get(
      `SELECT
        b.*,
        d.name as dog_name,
        r.number as room_number
       FROM bookings b
       LEFT JOIN dogs d ON b.dog_id = d.id
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE b.id = ?`,
      [result.lastID]
    );

    res.status(201).json({
      success: true,
      message: '预约创建成功',
      data: newBooking
    });
  } catch (error) {
    console.error('创建预约错误:', error);
    res.status(500).json({
      error: '创建预约失败',
      code: 'CREATE_BOOKING_ERROR'
    });
  }
});

// 更新预约信息（需要编辑权限）
router.put('/:id', requirePermission('can_edit'), auditLog('update_booking', 'bookings', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // 检查预约是否存在且属于当前门店
    const existingBooking = await db.get(
      `SELECT
        b.*,
        d.id as dog_id,
        r.id as room_id,
        r.price_per_day
       FROM bookings b
       LEFT JOIN dogs d ON b.dog_id = d.id
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE b.id = ? AND b.store_id = ?`,
      [id, req.storeId]
    );

    if (!existingBooking) {
      return res.status(404).json({
        error: '预约不存在',
        code: 'BOOKING_NOT_FOUND'
      });
    }

    // 不能修改已取消或已完成的预约
    if (existingBooking.status === 'cancelled' || existingBooking.status === 'completed') {
      return res.status(400).json({
        error: '不能修改已取消或已完成的预约',
        code: 'CANNOT_MODIFY_COMPLETED_BOOKING'
      });
    }

    // 处理时间更新
    let checkInTime = existingBooking.check_in_time;
    let checkOutTime = existingBooking.check_out_time;
    let roomId = existingBooking.room_id;
    let dogId = existingBooking.dog_id;

    if (updateData.check_in_time) checkInTime = updateData.check_in_time;
    if (updateData.check_out_time) checkOutTime = updateData.check_out_time;
    if (updateData.room_id) roomId = updateData.room_id;
    if (updateData.dog_id) dogId = updateData.dog_id;

    const checkIn = new Date(checkInTime);
    const checkOut = new Date(checkOutTime);

    if (checkIn >= checkOut) {
      return res.status(400).json({
        error: '离店时间必须晚于入住时间',
        code: 'INVALID_TIME_RANGE'
      });
    }

    // 如果房间有变化，检查新房间是否可用
    if (updateData.room_id && updateData.room_id !== existingBooking.room_id) {
      const conflictingBooking = await db.get(
        `SELECT id FROM bookings
         WHERE room_id = ? AND status = 'active' AND id != ?
           AND (
             (check_in_time < ? AND check_out_time > ?)
             OR (check_in_time < ? AND check_out_time > ?)
           )`,
        [roomId, id, checkOut, checkIn, checkIn, checkOut]
      );

      if (conflictingBooking) {
        return res.status(400).json({
          error: '新房间在指定时间范围内已被预约',
          code: 'NEW_ROOM_NOT_AVAILABLE'
        });
      }
    }

    // 如果狗狗有变化，检查新狗狗是否有冲突预约
    if (updateData.dog_id && updateData.dog_id !== existingBooking.dog_id) {
      const dogConflictingBooking = await db.get(
        `SELECT id FROM bookings
         WHERE dog_id = ? AND status = 'active' AND id != ?
           AND (
             (check_in_time < ? AND check_out_time > ?)
             OR (check_in_time < ? AND check_out_time > ?)
           )`,
        [dogId, id, checkOut, checkIn, checkIn, checkOut]
      );

      if (dogConflictingBooking) {
        return res.status(400).json({
          error: '新狗狗在指定时间范围内已有预约',
          code: 'NEW_DOG_ALREADY_BOOKED'
        });
      }
    }

    // 构建更新字段
    const allowedFields = [
      'dog_id', 'room_id', 'check_in_time', 'check_out_time',
      'special_requirements', 'notes', 'status',
      'actual_check_in', 'actual_check_out', 'paid_amount'
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

    // 重新计算总金额（如果时间或房间有变化）
    if (updateData.check_in_time || updateData.check_out_time || updateData.room_id) {
      const room = await db.get(
        'SELECT price_per_day FROM rooms WHERE id = ?',
        [roomId]
      );

      const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
      const totalAmount = nights * room.price_per_day;

      updates.push('total_amount = ?');
      params.push(totalAmount);
    }

    updates.push('updated_at = datetime("now")');
    params.push(id, req.storeId);

    const query = `UPDATE bookings SET ${updates.join(', ')} WHERE id = ? AND store_id = ?`;
    await db.run(query, params);

    // 更新狗狗状态
    if (updateData.dog_id || updateData.status) {
      const newDogId = updateData.dog_id || existingBooking.dog_id;
      const newStatus = updateData.status || existingBooking.status;

      let dogStatus = 'available';
      if (newStatus === 'active') {
        dogStatus = 'reserved';
      }

      await db.run(
        'UPDATE dogs SET status = ?, updated_at = datetime("now") WHERE id = ?',
        [dogStatus, newDogId]
      );
    }

    // 获取更新后的预约
    const updatedBooking = await db.get(
      `SELECT
        b.*,
        d.name as dog_name,
        r.number as room_number
       FROM bookings b
       LEFT JOIN dogs d ON b.dog_id = d.id
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE b.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: '预约更新成功',
      data: updatedBooking
    });
  } catch (error) {
    console.error('更新预约错误:', error);
    res.status(500).json({
      error: '更新预约失败',
      code: 'UPDATE_BOOKING_ERROR'
    });
  }
});

// 确认入住
router.post('/:id/checkin', requirePermission('can_edit'), auditLog('checkin_booking', 'bookings', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;

    // 检查预约是否存在且属于当前门店
    const booking = await db.get(
      'SELECT id, dog_id, status, checked_in FROM bookings WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!booking) {
      return res.status(404).json({
        error: '预约不存在',
        code: 'BOOKING_NOT_FOUND'
      });
    }

    if (booking.status !== 'active') {
      return res.status(400).json({
        error: '只能确认活跃预约的入住',
        code: 'NOT_ACTIVE_BOOKING'
      });
    }

    if (booking.checked_in) {
      return res.status(400).json({
        error: '该预约已确认入住',
        code: 'ALREADY_CHECKED_IN'
      });
    }

    // 更新入住状态
    await db.run(
      `UPDATE bookings
       SET checked_in = 1,
           actual_check_in = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
      [id]
    );

    // 更新狗狗状态为在店
    await db.run(
      'UPDATE dogs SET status = "in_store", updated_at = datetime("now") WHERE id = ?',
      [booking.dog_id]
    );

    // 更新房间状态为已占用
    await db.run(
      `UPDATE rooms
       SET status = 'occupied',
           updated_at = datetime('now')
       WHERE id IN (SELECT room_id FROM bookings WHERE id = ?)`,
      [id]
    );

    res.json({
      success: true,
      message: '入住确认成功'
    });
  } catch (error) {
    console.error('确认入住错误:', error);
    res.status(500).json({
      error: '确认入住失败',
      code: 'CHECKIN_BOOKING_ERROR'
    });
  }
});

// 确认离店
router.post('/:id/checkout', requirePermission('can_edit'), auditLog('checkout_booking', 'bookings', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;
    const { final_payment } = req.body;

    // 检查预约是否存在且属于当前门店
    const booking = await db.get(
      'SELECT id, dog_id, room_id, total_amount, paid_amount, status FROM bookings WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!booking) {
      return res.status(404).json({
        error: '预约不存在',
        code: 'BOOKING_NOT_FOUND'
      });
    }

    if (booking.status !== 'active') {
      return res.status(400).json({
        error: '只能确认活跃预约的离店',
        code: 'NOT_ACTIVE_BOOKING'
      });
    }

    // 计算最终支付金额
    let finalPayment = final_payment || 0;
    if (finalPayment > 0) {
      const newPaidAmount = (booking.paid_amount || 0) + finalPayment;
      await db.run(
        'UPDATE bookings SET paid_amount = ?, updated_at = datetime("now") WHERE id = ?',
        [newPaidAmount, id]
      );
    }

    // 更新离店状态
    await db.run(
      `UPDATE bookings
       SET status = 'completed',
           actual_check_out = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
      [id]
    );

    // 更新狗狗状态为可用
    await db.run(
      'UPDATE dogs SET status = "available", updated_at = datetime("now") WHERE id = ?',
      [booking.dog_id]
    );

    // 更新房间状态为可用
    await db.run(
      'UPDATE rooms SET status = "available", updated_at = datetime("now") WHERE id = ?',
      [booking.room_id]
    );

    res.json({
      success: true,
      message: '离店确认成功'
    });
  } catch (error) {
    console.error('确认离店错误:', error);
    res.status(500).json({
      error: '确认离店失败',
      code: 'CHECKOUT_BOOKING_ERROR'
    });
  }
});

// 取消预约（需要编辑权限）
router.post('/:id/cancel', requirePermission('can_edit'), auditLog('cancel_booking', 'bookings', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // 检查预约是否存在且属于当前门店
    const booking = await db.get(
      'SELECT id, dog_id, room_id, status FROM bookings WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!booking) {
      return res.status(404).json({
        error: '预约不存在',
        code: 'BOOKING_NOT_FOUND'
      });
    }

    if (booking.status !== 'active') {
      return res.status(400).json({
        error: '只能取消活跃预约',
        code: 'NOT_ACTIVE_BOOKING'
      });
    }

    // 取消预约
    await db.run(
      `UPDATE bookings
       SET status = 'cancelled',
           notes = COALESCE(notes || '\n', '') || ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [`[取消原因] ${reason || '用户取消'}`, id]
    );

    // 更新狗狗状态为可用
    await db.run(
      'UPDATE dogs SET status = "available", updated_at = datetime("now") WHERE id = ?',
      [booking.dog_id]
    );

    // 如果房间状态是占用且只有这一个预约，更新为可用
    const roomBookings = await db.get(
      `SELECT COUNT(*) as active_count
       FROM bookings
       WHERE room_id = ? AND status = 'active'`,
      [booking.room_id]
    );

    if (roomBookings.active_count === 0) {
      await db.run(
        'UPDATE rooms SET status = "available", updated_at = datetime("now") WHERE id = ?',
        [booking.room_id]
      );
    }

    res.json({
      success: true,
      message: '预约取消成功'
    });
  } catch (error) {
    console.error('取消预约错误:', error);
    res.status(500).json({
      error: '取消预约失败',
      code: 'CANCEL_BOOKING_ERROR'
    });
  }
});

// 删除预约（需要删除权限）
router.delete('/:id', requirePermission('can_delete'), auditLog('delete_booking', 'bookings', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;

    // 检查预约是否存在且属于当前门店
    const booking = await db.get(
      'SELECT id, dog_id, room_id, status FROM bookings WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!booking) {
      return res.status(404).json({
        error: '预约不存在',
        code: 'BOOKING_NOT_FOUND'
      });
    }

    // 不能删除活跃预约，必须先取消
    if (booking.status === 'active') {
      return res.status(400).json({
        error: '不能删除活跃预约，请先取消',
        code: 'CANNOT_DELETE_ACTIVE_BOOKING'
      });
    }

    // 删除预约
    await db.run(
      'DELETE FROM bookings WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: '预约删除成功'
    });
  } catch (error) {
    console.error('删除预约错误:', error);
    res.status(500).json({
      error: '删除预约失败',
      code: 'DELETE_BOOKING_ERROR'
    });
  }
});

module.exports = router;
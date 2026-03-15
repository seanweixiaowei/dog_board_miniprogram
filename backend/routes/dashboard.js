const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

// 所有路由都需要认证
router.use(authenticate);

// 获取仪表盘统计数据
router.get('/stats', requirePermission('can_view'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 并行获取所有统计数据
    const [
      totalRooms,
      totalDogs,
      occupiedRooms,
      todayBookings,
      availableRooms,
      todayScheduledCheckins,
      todayNotCheckedIn,
      inStoreDogs,
      availableRoomsToday
    ] = await Promise.all([
      // 总房间数
      db.get('SELECT COUNT(*) as count FROM rooms WHERE store_id = ?', [storeId]),
      // 总狗狗数
      db.get('SELECT COUNT(*) as count FROM dogs WHERE store_id = ?', [storeId]),
      // 占用房间数
      db.get(`SELECT COUNT(DISTINCT r.id) as count
              FROM rooms r
              INNER JOIN bookings b ON r.id = b.room_id
              WHERE r.store_id = ? AND b.status = 'active' AND b.checked_in = 1`, [storeId]),
      // 今日预约数
      db.get(`SELECT COUNT(*) as count
              FROM bookings
              WHERE store_id = ? AND status = 'active'
                AND DATE(check_in_time) = ?`, [storeId, today]),
      // 可用房间数（总房间-占用房间）
      db.get(`SELECT COUNT(*) as count
              FROM rooms
              WHERE store_id = ? AND status = 'available'`, [storeId]),
      // 今日应入住
      db.get(`SELECT COUNT(*) as count
              FROM bookings
              WHERE store_id = ? AND status = 'active'
                AND DATE(check_in_time) = ?
                AND checked_in = 0`, [storeId, today]),
      // 今日未入住（超过预约时间未入住）
      db.get(`SELECT COUNT(*) as count
              FROM bookings
              WHERE store_id = ? AND status = 'active'
                AND checked_in = 0
                AND check_in_time < ?`, [storeId, now.toISOString()]),
      // 在店狗狗数
      db.get(`SELECT COUNT(DISTINCT b.dog_id) as count
              FROM bookings b
              WHERE b.store_id = ? AND b.status = 'active' AND b.checked_in = 1
                AND b.check_in_time <= ? AND b.check_out_time > ?`, [storeId, now.toISOString(), now.toISOString()]),
      // 今日空闲房间（今天可预定的房间）
      db.get(`SELECT COUNT(*) as count
              FROM rooms r
              WHERE r.store_id = ? AND r.status = 'available'
                AND r.id NOT IN (
                  SELECT room_id FROM bookings
                  WHERE status = 'active'
                    AND (check_in_time <= ? AND check_out_time > ?)
                )`, [storeId, now.toISOString(), now.toISOString()])
    ]);

    const stats = {
      totalRooms: totalRooms.count,
      totalDogs: totalDogs.count,
      occupiedRooms: occupiedRooms.count,
      todayBookings: todayBookings.count,
      availableRooms: availableRooms.count,
      todayScheduledCheckins: todayScheduledCheckins.count,
      todayNotCheckedIn: todayNotCheckedIn.count,
      inStoreDogs: inStoreDogs.count,
      availableRoomsToday: availableRoomsToday.count
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计数据错误:', error);
    res.status(500).json({
      error: '获取统计数据失败',
      code: 'GET_STATS_ERROR'
    });
  }
});

// 获取今日提醒
router.get('/reminders', requirePermission('can_view'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
    const next24Hours = new Date(now.getTime() + 86400000);

    const reminders = [];

    // 今日入住
    const todayCheckins = await db.get(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE store_id = ? AND status = 'active'
         AND DATE(check_in_time) = ?
         AND checked_in = 0`,
      [storeId, today]
    );

    if (todayCheckins.count > 0) {
      reminders.push({
        title: '今日入住',
        content: `${todayCheckins.count}只狗狗`,
        color: '#666',
        bgColor: '#f5f5f5',
        type: 'checkin',
        count: todayCheckins.count
      });
    }

    // 今日离店
    const todayCheckouts = await db.get(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE store_id = ? AND status = 'active'
         AND DATE(check_out_time) = ?
         AND checked_in = 1`,
      [storeId, today]
    );

    if (todayCheckouts.count > 0) {
      reminders.push({
        title: '今日离店',
        content: `${todayCheckouts.count}只狗狗`,
        color: '#888',
        bgColor: '#f0f0f0',
        type: 'checkout',
        count: todayCheckouts.count
      });
    }

    // 在店狗狗
    const inStoreDogs = await db.get(
      `SELECT COUNT(DISTINCT b.dog_id) as count
       FROM bookings b
       WHERE b.store_id = ? AND b.status = 'active' AND b.checked_in = 1
         AND b.check_in_time <= ? AND b.check_out_time > ?`,
      [storeId, now.toISOString(), now.toISOString()]
    );

    if (inStoreDogs.count > 0) {
      reminders.push({
        title: '在店狗狗',
        content: `${inStoreDogs.count}只`,
        color: '#333',
        bgColor: '#f5f5f5',
        type: 'in_store',
        count: inStoreDogs.count
      });
    }

    // 未来24小时离店
    const upcomingCheckouts = await db.get(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE store_id = ? AND status = 'active'
         AND checked_in = 1
         AND check_out_time > ? AND check_out_time < ?`,
      [storeId, now.toISOString(), next24Hours.toISOString()]
    );

    if (upcomingCheckouts.count > 0) {
      reminders.push({
        title: '未来24小时离店',
        content: `${upcomingCheckouts.count}只`,
        color: '#888',
        bgColor: '#f0f0f0',
        type: 'upcoming_checkout',
        count: upcomingCheckouts.count
      });
    }

    // 今日未入住（迟到）
    const lateCheckins = await db.get(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE store_id = ? AND status = 'active'
         AND checked_in = 0
         AND check_in_time < ?`,
      [storeId, now.toISOString()]
    );

    if (lateCheckins.count > 0) {
      reminders.push({
        title: '已过预约时间未入住',
        content: `${lateCheckins.count}只`,
        color: '#ff4444',
        bgColor: '#ffeeee',
        type: 'late_checkin',
        count: lateCheckins.count
      });
    }

    // 需要续费的预约（离店时间快到了但未全额支付）
    const needRenewal = await db.get(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE store_id = ? AND status = 'active'
         AND checked_in = 1
         AND check_out_time > ? AND check_out_time < ?
         AND (paid_amount IS NULL OR paid_amount < total_amount)`,
      [storeId, now.toISOString(), next24Hours.toISOString()]
    );

    if (needRenewal.count > 0) {
      reminders.push({
        title: '需要续费或结算',
        content: `${needRenewal.count}个预约`,
        color: '#ff8800',
        bgColor: '#fff4e6',
        type: 'need_payment',
        count: needRenewal.count
      });
    }

    res.json({
      success: true,
      data: reminders
    });
  } catch (error) {
    console.error('获取提醒错误:', error);
    res.status(500).json({
      error: '获取提醒失败',
      code: 'GET_REMINDERS_ERROR'
    });
  }
});

// 获取今日应入住列表
router.get('/today-checkins', requirePermission('can_view'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const today = new Date().toISOString().split('T')[0];

    const checkins = await db.query(
      `SELECT
        b.id,
        b.check_in_time,
        b.check_out_time,
        b.checked_in,
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
       WHERE b.store_id = ? AND b.status = 'active'
         AND DATE(b.check_in_time) = ?
       ORDER BY b.check_in_time ASC`,
      [storeId, today]
    );

    res.json({
      success: true,
      data: checkins
    });
  } catch (error) {
    console.error('获取今日应入住列表错误:', error);
    res.status(500).json({
      error: '获取今日应入住列表失败',
      code: 'GET_TODAY_CHECKINS_ERROR'
    });
  }
});

// 获取今日未入住列表（迟到）
router.get('/late-checkins', requirePermission('can_view'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const now = new Date().toISOString();

    const lateCheckins = await db.query(
      `SELECT
        b.id,
        b.check_in_time,
        b.check_out_time,
        b.checked_in,
        d.name as dog_name,
        d.owner as dog_owner,
        d.phone as dog_phone,
        r.number as room_number,
        r.type as room_type,
        u.name as created_by_name,
        ROUND((JULIANDAY(?) - JULIANDAY(b.check_in_time)) * 24) as delay_hours
       FROM bookings b
       LEFT JOIN dogs d ON b.dog_id = d.id
       LEFT JOIN rooms r ON b.room_id = r.id
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.store_id = ? AND b.status = 'active'
         AND b.checked_in = 0
         AND b.check_in_time < ?
       ORDER BY b.check_in_time ASC`,
      [now, storeId, now]
    );

    res.json({
      success: true,
      data: lateCheckins
    });
  } catch (error) {
    console.error('获取今日未入住列表错误:', error);
    res.status(500).json({
      error: '获取今日未入住列表失败',
      code: 'GET_LATE_CHECKINS_ERROR'
    });
  }
});

// 获取在店狗狗列表
router.get('/in-store-dogs', requirePermission('can_view'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const now = new Date().toISOString();

    const inStoreDogs = await db.query(
      `SELECT
        b.id,
        b.check_in_time,
        b.check_out_time,
        b.checked_in,
        b.paid_amount,
        b.total_amount,
        d.name as dog_name,
        d.owner as dog_owner,
        d.phone as dog_phone,
        d.breed as dog_breed,
        d.age as dog_age,
        d.special_notes as dog_special_notes,
        r.number as room_number,
        r.type as room_type,
        u.name as created_by_name
       FROM bookings b
       LEFT JOIN dogs d ON b.dog_id = d.id
       LEFT JOIN rooms r ON b.room_id = r.id
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.store_id = ? AND b.status = 'active'
         AND b.checked_in = 1
         AND b.check_in_time <= ? AND b.check_out_time > ?
       ORDER BY b.check_out_time ASC`,
      [storeId, now, now]
    );

    // 计算剩余天数
    for (const dog of inStoreDogs) {
      const checkOut = new Date(dog.check_out_time);
      const remainingMs = checkOut - new Date();
      dog.remaining_days = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
      dog.remaining_hours = Math.ceil(remainingMs / (1000 * 60 * 60));
    }

    res.json({
      success: true,
      data: inStoreDogs
    });
  } catch (error) {
    console.error('获取在店狗狗列表错误:', error);
    res.status(500).json({
      error: '获取在店狗狗列表失败',
      code: 'GET_IN_STORE_DOGS_ERROR'
    });
  }
});

// 获取每日视图（按日期统计）
router.get('/daily-view/:date', requirePermission('can_view'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const { date } = req.params;

    // 验证日期格式
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: '日期格式不正确，应为 YYYY-MM-DD',
        code: 'INVALID_DATE_FORMAT'
      });
    }

    // 获取当日入住数
    const checkIns = await db.get(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE store_id = ? AND status = 'active'
         AND DATE(check_in_time) = ?`,
      [storeId, date]
    );

    // 获取当日离店数
    const checkOuts = await db.get(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE store_id = ? AND status = 'active'
         AND DATE(check_out_time) = ?`,
      [storeId, date]
    );

    // 获取当日活跃预约数
    const activeBookings = await db.get(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE store_id = ? AND status = 'active'
         AND DATE(check_in_time) <= ? AND DATE(check_out_time) >= ?`,
      [storeId, date, date]
    );

    // 获取当日空闲房间数
    const availableRooms = await db.get(
      `SELECT COUNT(*) as count
       FROM rooms r
       WHERE r.store_id = ? AND r.status = 'available'
         AND r.id NOT IN (
           SELECT room_id FROM bookings
           WHERE status = 'active'
             AND DATE(check_in_time) <= ? AND DATE(check_out_time) > ?
         )`,
      [storeId, date, date]
    );

    // 获取当日预约详情
    const bookings = await db.query(
      `SELECT
        b.*,
        d.name as dog_name,
        d.owner as dog_owner,
        r.number as room_number,
        r.type as room_type
       FROM bookings b
       LEFT JOIN dogs d ON b.dog_id = d.id
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE b.store_id = ? AND b.status = 'active'
         AND DATE(b.check_in_time) <= ? AND DATE(b.check_out_time) >= ?
       ORDER BY b.check_in_time ASC`,
      [storeId, date, date]
    );

    const dailyData = {
      date,
      checkIns: checkIns.count,
      checkOuts: checkOuts.count,
      activeBookings: activeBookings.count,
      availableRooms: availableRooms.count,
      bookings
    };

    res.json({
      success: true,
      data: dailyData
    });
  } catch (error) {
    console.error('获取每日视图错误:', error);
    res.status(500).json({
      error: '获取每日视图失败',
      code: 'GET_DAILY_VIEW_ERROR'
    });
  }
});

// 获取收入统计
router.get('/revenue-stats', requirePermission('can_view'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const { start_date, end_date } = req.query;

    let dateCondition = '';
    const params = [storeId];

    if (start_date && end_date) {
      dateCondition = ' AND DATE(created_at) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else {
      // 默认最近30天
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateCondition = ' AND DATE(created_at) >= ?';
      params.push(thirtyDaysAgo.toISOString().split('T')[0]);
    }

    // 总收入
    const totalRevenue = await db.get(
      `SELECT SUM(total_amount) as total, SUM(paid_amount) as paid
       FROM bookings
       WHERE store_id = ? AND status IN ('completed', 'active') ${dateCondition}`,
      params
    );

    // 按房间类型统计
    const revenueByRoomType = await db.query(
      `SELECT
        r.type,
        COUNT(b.id) as booking_count,
        SUM(b.total_amount) as total_amount,
        SUM(b.paid_amount) as paid_amount
       FROM bookings b
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE b.store_id = ? AND b.status IN ('completed', 'active') ${dateCondition}
       GROUP BY r.type
       ORDER BY total_amount DESC`,
      params
    );

    // 按日期统计
    const revenueByDate = await db.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(id) as booking_count,
        SUM(total_amount) as total_amount,
        SUM(paid_amount) as paid_amount
       FROM bookings
       WHERE store_id = ? AND status IN ('completed', 'active') ${dateCondition}
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 30`,
      params
    );

    const stats = {
      total_revenue: totalRevenue.total || 0,
      total_paid: totalRevenue.paid || 0,
      outstanding: (totalRevenue.total || 0) - (totalRevenue.paid || 0),
      by_room_type: revenueByRoomType,
      by_date: revenueByDate
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取收入统计错误:', error);
    res.status(500).json({
      error: '获取收入统计失败',
      code: 'GET_REVENUE_STATS_ERROR'
    });
  }
});

module.exports = router;
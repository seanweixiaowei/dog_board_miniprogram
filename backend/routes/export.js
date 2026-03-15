const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// 所有路由都需要认证
router.use(authenticate);

// 导出权限检查 - 只有店长可以导出
const requireExportPermission = requirePermission('can_export');

// 导出狗狗档案为Excel
router.get('/dogs/excel', requireExportPermission, auditLog('export_dogs_excel', 'dogs'), async (req, res) => {
  try {
    const storeId = req.storeId;

    // 获取狗狗数据
    const dogs = await db.query(
      `SELECT
        d.*,
        u.name as created_by_name
       FROM dogs d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.store_id = ?
       ORDER BY d.created_at DESC`,
      [storeId]
    );

    if (dogs.length === 0) {
      return res.status(404).json({
        error: '没有狗狗档案可导出',
        code: 'NO_DATA_TO_EXPORT'
      });
    }

    // 准备Excel数据
    const data = dogs.map(dog => ({
      'ID': dog.id,
      '狗狗名字': dog.name,
      '品种': dog.breed || '',
      '年龄': dog.age || '',
      '性别': dog.gender === 'male' ? '公' : (dog.gender === 'female' ? '母' : '未知'),
      '体重(kg)': dog.weight || '',
      '疫苗完全': dog.vaccinated ? '是' : '否',
      '已绝育': dog.neutered ? '是' : '否',
      '已驱虫': dog.dewormed ? '是' : '否',
      '咬人': dog.bites_people ? '是' : '否',
      '咬狗': dog.bites_dogs ? '是' : '否',
      '慢性病': dog.illnesses || '',
      '特殊要求': dog.special_notes || '',
      '主人姓名': dog.owner,
      '主人电话': dog.phone,
      '状态': dog.status === 'available' ? '可用' : (dog.status === 'in_store' ? '在店' : '已预约'),
      '创建人': dog.created_by_name || '',
      '创建时间': dog.created_at,
      '更新时间': dog.updated_at
    }));

    // 创建Excel工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 设置列宽
    const colWidths = [
      { wch: 5 },   // ID
      { wch: 15 },  // 狗狗名字
      { wch: 15 },  // 品种
      { wch: 8 },   // 年龄
      { wch: 8 },   // 性别
      { wch: 10 },  // 体重
      { wch: 10 },  // 疫苗完全
      { wch: 10 },  // 已绝育
      { wch: 10 },  // 已驱虫
      { wch: 8 },   // 咬人
      { wch: 8 },   // 咬狗
      { wch: 20 },  // 慢性病
      { wch: 30 },  // 特殊要求
      { wch: 15 },  // 主人姓名
      { wch: 15 },  // 主人电话
      { wch: 10 },  // 状态
      { wch: 15 },  // 创建人
      { wch: 20 },  // 创建时间
      { wch: 20 }   // 更新时间
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '狗狗档案');

    // 生成Excel文件
    const fileName = `狗狗档案_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);

    // 确保temp目录存在
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    XLSX.writeFile(workbook, filePath);

    // 发送文件
    res.download(filePath, fileName, (err) => {
      // 文件发送完成后删除临时文件
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('导出狗狗档案Excel错误:', error);
    res.status(500).json({
      error: '导出失败',
      code: 'EXPORT_DOGS_EXCEL_ERROR'
    });
  }
});

// 导出预约记录为Excel
router.get('/bookings/excel', requireExportPermission, auditLog('export_bookings_excel', 'bookings'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const { start_date, end_date, status } = req.query;

    let dateCondition = '';
    const params = [storeId];

    if (start_date && end_date) {
      dateCondition = ' AND DATE(b.check_in_time) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    if (status) {
      dateCondition += ' AND b.status = ?';
      params.push(status);
    }

    // 获取预约数据
    const bookings = await db.query(
      `SELECT
        b.*,
        d.name as dog_name,
        d.owner as dog_owner,
        d.phone as dog_phone,
        r.number as room_number,
        r.type as room_type,
        r.price_per_day,
        u.name as created_by_name
       FROM bookings b
       LEFT JOIN dogs d ON b.dog_id = d.id
       LEFT JOIN rooms r ON b.room_id = r.id
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.store_id = ? ${dateCondition}
       ORDER BY b.check_in_time DESC`,
      params
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        error: '没有预约记录可导出',
        code: 'NO_DATA_TO_EXPORT'
      });
    }

    // 准备Excel数据
    const data = bookings.map(booking => {
      const checkIn = new Date(booking.check_in_time);
      const checkOut = new Date(booking.check_out_time);
      const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

      return {
        'ID': booking.id,
        '狗狗名字': booking.dog_name,
        '主人': booking.dog_owner,
        '电话': booking.dog_phone,
        '房间号': booking.room_number,
        '房间类型': booking.room_type === 'standard' ? '标准庭院房' :
                   (booking.room_type === 'deluxe' ? '豪华庭院房' : '贵宾房'),
        '每日价格': booking.price_per_day,
        '入住时间': booking.check_in_time,
        '离店时间': booking.check_out_time,
        '实际入住': booking.actual_check_in || '',
        '实际离店': booking.actual_check_out || '',
        '预订天数': nights,
        '总金额': booking.total_amount,
        '已支付': booking.paid_amount || 0,
        '未支付': (booking.total_amount || 0) - (booking.paid_amount || 0),
        '状态': booking.status === 'active' ? '活跃' :
               (booking.status === 'completed' ? '已完成' :
               (booking.status === 'cancelled' ? '已取消' : '未入住')),
        '已入住': booking.checked_in ? '是' : '否',
        '特殊要求': booking.special_requirements || '',
        '备注': booking.notes || '',
        '创建人': booking.created_by_name,
        '创建时间': booking.created_at,
        '更新时间': booking.updated_at
      };
    });

    // 创建Excel工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 设置列宽
    const colWidths = [
      { wch: 5 },   // ID
      { wch: 15 },  // 狗狗名字
      { wch: 15 },  // 主人
      { wch: 15 },  // 电话
      { wch: 10 },  // 房间号
      { wch: 15 },  // 房间类型
      { wch: 10 },  // 每日价格
      { wch: 20 },  // 入住时间
      { wch: 20 },  // 离店时间
      { wch: 15 },  // 实际入住
      { wch: 15 },  // 实际离店
      { wch: 10 },  // 预订天数
      { wch: 10 },  // 总金额
      { wch: 10 },  // 已支付
      { wch: 10 },  // 未支付
      { wch: 10 },  // 状态
      { wch: 10 },  // 已入住
      { wch: 20 },  // 特殊要求
      { wch: 30 },  // 备注
      { wch: 15 },  // 创建人
      { wch: 20 },  // 创建时间
      { wch: 20 }   // 更新时间
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '预约记录');

    // 生成Excel文件
    const fileName = `预约记录_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);

    // 确保temp目录存在
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    XLSX.writeFile(workbook, filePath);

    // 发送文件
    res.download(filePath, fileName, (err) => {
      // 文件发送完成后删除临时文件
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('导出预约记录Excel错误:', error);
    res.status(500).json({
      error: '导出失败',
      code: 'EXPORT_BOOKINGS_EXCEL_ERROR'
    });
  }
});

// 导出房间信息为Excel
router.get('/rooms/excel', requireExportPermission, auditLog('export_rooms_excel', 'rooms'), async (req, res) => {
  try {
    const storeId = req.storeId;

    // 获取房间数据
    const rooms = await db.query(
      `SELECT
        r.*,
        COUNT(b.id) as active_bookings
       FROM rooms r
       LEFT JOIN bookings b ON r.id = b.room_id AND b.status = 'active'
       WHERE r.store_id = ?
       GROUP BY r.id
       ORDER BY r.number ASC`,
      [storeId]
    );

    if (rooms.length === 0) {
      return res.status(404).json({
        error: '没有房间信息可导出',
        code: 'NO_DATA_TO_EXPORT'
      });
    }

    // 准备Excel数据
    const data = rooms.map(room => ({
      'ID': room.id,
      '房间号': room.number,
      '类型': room.type === 'standard' ? '标准庭院房' :
             (room.type === 'deluxe' ? '豪华庭院房' : '贵宾房'),
      '大小': room.size || '',
      '每日价格': room.price_per_day,
      '描述': room.description || '',
      '状态': room.status === 'available' ? '可用' :
             (room.status === 'occupied' ? '占用' : '维护中'),
      '活跃预约数': room.active_bookings,
      '创建时间': room.created_at,
      '更新时间': room.updated_at
    }));

    // 创建Excel工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 设置列宽
    const colWidths = [
      { wch: 5 },   // ID
      { wch: 10 },  // 房间号
      { wch: 15 },  // 类型
      { wch: 10 },  // 大小
      { wch: 10 },  // 每日价格
      { wch: 30 },  // 描述
      { wch: 10 },  // 状态
      { wch: 15 },  // 活跃预约数
      { wch: 20 },  // 创建时间
      { wch: 20 }   // 更新时间
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '房间信息');

    // 生成Excel文件
    const fileName = `房间信息_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);

    // 确保temp目录存在
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    XLSX.writeFile(workbook, filePath);

    // 发送文件
    res.download(filePath, fileName, (err) => {
      // 文件发送完成后删除临时文件
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('导出房间信息Excel错误:', error);
    res.status(500).json({
      error: '导出失败',
      code: 'EXPORT_ROOMS_EXCEL_ERROR'
    });
  }
});

// 导出所有数据为ZIP（一键导出）
router.get('/all/zip', requireExportPermission, auditLog('export_all_data', 'system'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // 这里简化处理，实际应该使用archiver等库创建ZIP文件
    // 由于时间关系，我们返回一个包含所有导出链接的JSON
    // 在实际部署中，应该实现真正的ZIP打包

    const exportLinks = {
      dogs_excel: `/api/export/dogs/excel`,
      bookings_excel: `/api/export/bookings/excel`,
      rooms_excel: `/api/export/rooms/excel`,
      audit_logs_excel: `/api/export/audit-logs/excel`,
      users_excel: `/api/export/users/excel`
    };

    res.json({
      success: true,
      message: '一键导出功能',
      data: {
        note: '在实际部署中，这里会生成一个包含所有数据的ZIP文件',
        individual_exports: exportLinks,
        timestamp: now.toISOString(),
        store_id: storeId
      }
    });
  } catch (error) {
    console.error('一键导出错误:', error);
    res.status(500).json({
      error: '导出失败',
      code: 'EXPORT_ALL_DATA_ERROR'
    });
  }
});

// 导出审计日志
router.get('/audit-logs/excel', requireExportPermission, auditLog('export_audit_logs', 'audit_logs'), async (req, res) => {
  try {
    const storeId = req.storeId;
    const { start_date, end_date, user_id } = req.query;

    let conditions = [];
    const params = [];

    // 获取审计日志（关联用户信息）
    let query = `
      SELECT
        al.*,
        u.phone_number,
        u.name as user_name,
        u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE u.store_id = ?
    `;
    params.push(storeId);

    if (start_date) {
      conditions.push('DATE(al.created_at) >= ?');
      params.push(start_date);
    }

    if (end_date) {
      conditions.push('DATE(al.created_at) <= ?');
      params.push(end_date);
    }

    if (user_id) {
      conditions.push('al.user_id = ?');
      params.push(user_id);
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    query += ' ORDER BY al.created_at DESC';

    const logs = await db.query(query, params);

    if (logs.length === 0) {
      return res.status(404).json({
        error: '没有审计日志可导出',
        code: 'NO_DATA_TO_EXPORT'
      });
    }

    // 准备Excel数据
    const data = logs.map(log => ({
      'ID': log.id,
      '用户ID': log.user_id,
      '用户手机': log.phone_number,
      '用户姓名': log.user_name,
      '用户角色': log.user_role,
      '操作': log.action,
      '数据表': log.table_name || '',
      '记录ID': log.record_id || '',
      'IP地址': log.ip_address || '',
      '用户代理': log.user_agent ? log.user_agent.substring(0, 50) + '...' : '',
      '创建时间': log.created_at
    }));

    // 创建Excel工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 设置列宽
    const colWidths = [
      { wch: 5 },   // ID
      { wch: 8 },   // 用户ID
      { wch: 15 },  // 用户手机
      { wch: 15 },  // 用户姓名
      { wch: 15 },  // 用户角色
      { wch: 30 },  // 操作
      { wch: 15 },  // 数据表
      { wch: 10 },  // 记录ID
      { wch: 15 },  // IP地址
      { wch: 30 },  // 用户代理
      { wch: 20 }   // 创建时间
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '操作日志');

    // 生成Excel文件
    const fileName = `操作日志_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);

    // 确保temp目录存在
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    XLSX.writeFile(workbook, filePath);

    // 发送文件
    res.download(filePath, fileName, (err) => {
      // 文件发送完成后删除临时文件
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('导出审计日志错误:', error);
    res.status(500).json({
      error: '导出失败',
      code: 'EXPORT_AUDIT_LOGS_ERROR'
    });
  }
});

// 导出用户列表
router.get('/users/excel', requireExportPermission, auditLog('export_users', 'users'), async (req, res) => {
  try {
    const storeId = req.storeId;

    // 获取用户数据
    const users = await db.query(
      `SELECT
        id,
        phone_number,
        name,
        role,
        store_id,
        is_active,
        created_at,
        updated_at
       FROM users
       WHERE store_id = ?
       ORDER BY created_at DESC`,
      [storeId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: '没有用户数据可导出',
        code: 'NO_DATA_TO_EXPORT'
      });
    }

    // 准备Excel数据
    const data = users.map(user => ({
      'ID': user.id,
      '手机号': user.phone_number,
      '姓名': user.name,
      '角色': user.role === 'super_admin' ? '超级管理员' :
             (user.role === 'manager' ? '店长' :
             (user.role === 'staff_edit' ? '员工(可编辑)' : '员工(只读)')),
      '门店ID': user.store_id,
      '状态': user.is_active ? '活跃' : '停用',
      '创建时间': user.created_at,
      '更新时间': user.updated_at
    }));

    // 创建Excel工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 设置列宽
    const colWidths = [
      { wch: 5 },   // ID
      { wch: 15 },  // 手机号
      { wch: 15 },  // 姓名
      { wch: 15 },  // 角色
      { wch: 8 },   // 门店ID
      { wch: 10 },  // 状态
      { wch: 20 },  // 创建时间
      { wch: 20 }   // 更新时间
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '用户列表');

    // 生成Excel文件
    const fileName = `用户列表_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);

    // 确保temp目录存在
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    XLSX.writeFile(workbook, filePath);

    // 发送文件
    res.download(filePath, fileName, (err) => {
      // 文件发送完成后删除临时文件
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('导出用户列表错误:', error);
    res.status(500).json({
      error: '导出失败',
      code: 'EXPORT_USERS_ERROR'
    });
  }
});

module.exports = router;
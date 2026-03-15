const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { getAuditLogs } = require('../middleware/audit');

// 所有路由都需要认证
router.use(authenticate);

// 只有店长可以查看审计日志
const requireAuditPermission = requirePermission('can_view_audit');

// 获取审计日志列表
router.get('/', requireAuditPermission, async (req, res) => {
  try {
    const {
      user_id,
      action,
      table_name,
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;

    // 使用中间件提供的函数获取日志
    const result = await getAuditLogs({
      userId: user_id || null,
      action: action || null,
      tableName: table_name || null,
      startDate: start_date || null,
      endDate: end_date || null,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // 格式化日志数据
    const formattedLogs = result.logs.map(log => {
      let parsedOldData = null;
      let parsedNewData = null;

      try {
        if (log.old_data) parsedOldData = JSON.parse(log.old_data);
        if (log.new_data) parsedNewData = JSON.parse(log.new_data);
      } catch (e) {
        // 如果解析失败，保持原样
      }

      return {
        id: log.id,
        user_id: log.user_id,
        user_phone: log.phone_number,
        user_name: log.user_name,
        user_role: log.user_role,
        action: log.action,
        table_name: log.table_name,
        record_id: log.record_id,
        old_data: parsedOldData || log.old_data,
        new_data: parsedNewData || log.new_data,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        created_at: log.created_at
      };
    });

    res.json({
      success: true,
      data: formattedLogs,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('获取审计日志错误:', error);
    res.status(500).json({
      error: '获取审计日志失败',
      code: 'GET_AUDIT_LOGS_ERROR'
    });
  }
});

// 获取特定用户的审计日志
router.get('/user/:user_id', requireAuditPermission, async (req, res) => {
  try {
    const { user_id } = req.params;
    const {
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;

    // 验证用户是否存在且属于当前门店
    const user = await db.get(
      'SELECT id, name, role FROM users WHERE id = ? AND store_id = ?',
      [user_id, req.storeId]
    );

    if (!user) {
      return res.status(404).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 获取该用户的日志
    const result = await getAuditLogs({
      userId: user_id,
      startDate: start_date || null,
      endDate: end_date || null,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // 添加用户信息到响应
    const response = {
      success: true,
      user_info: {
        id: user.id,
        name: user.name,
        role: user.role
      },
      data: result.logs,
      pagination: result.pagination
    };

    res.json(response);
  } catch (error) {
    console.error('获取用户审计日志错误:', error);
    res.status(500).json({
      error: '获取用户审计日志失败',
      code: 'GET_USER_AUDIT_LOGS_ERROR'
    });
  }
});

// 获取数据表操作统计
router.get('/stats', requireAuditPermission, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let dateCondition = '';
    const params = [req.storeId];

    if (start_date && end_date) {
      dateCondition = ' AND DATE(al.created_at) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    // 按用户统计操作次数
    const userStats = await db.query(
      `SELECT
        u.id,
        u.name,
        u.role,
        COUNT(al.id) as operation_count
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE u.store_id = ? ${dateCondition}
       GROUP BY u.id, u.name, u.role
       ORDER BY operation_count DESC`,
      params
    );

    // 按操作类型统计
    const actionStats = await db.query(
      `SELECT
        CASE
          WHEN al.action LIKE '%create%' THEN '创建'
          WHEN al.action LIKE '%update%' THEN '更新'
          WHEN al.action LIKE '%delete%' THEN '删除'
          WHEN al.action LIKE '%login%' THEN '登录'
          WHEN al.action LIKE '%export%' THEN '导出'
          ELSE '其他'
        END as action_type,
        COUNT(al.id) as count
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE u.store_id = ? ${dateCondition}
       GROUP BY action_type
       ORDER BY count DESC`,
      params
    );

    // 按数据表统计
    const tableStats = await db.query(
      `SELECT
        al.table_name,
        COUNT(al.id) as count
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE u.store_id = ? AND al.table_name IS NOT NULL ${dateCondition}
       GROUP BY al.table_name
       ORDER BY count DESC`,
      params
    );

    // 按日期统计
    const dateStats = await db.query(
      `SELECT
        DATE(al.created_at) as date,
        COUNT(al.id) as count
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE u.store_id = ? ${dateCondition}
       GROUP BY DATE(al.created_at)
       ORDER BY date DESC
       LIMIT 30`,
      params
    );

    const stats = {
      user_stats: userStats,
      action_stats: actionStats,
      table_stats: tableStats,
      date_stats: dateStats,
      total_operations: userStats.reduce((sum, user) => sum + user.operation_count, 0)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取审计统计错误:', error);
    res.status(500).json({
      error: '获取审计统计失败',
      code: 'GET_AUDIT_STATS_ERROR'
    });
  }
});

// 搜索审计日志
router.get('/search', requireAuditPermission, async (req, res) => {
  try {
    const { q, page = 1, limit = 50 } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({
        error: '搜索关键词不能为空',
        code: 'EMPTY_SEARCH_QUERY'
      });
    }

    const offset = (page - 1) * limit;
    const searchTerm = `%${q}%`;

    const query = `
      SELECT
        al.*,
        u.phone_number,
        u.name as user_name,
        u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE u.store_id = ?
        AND (
          al.action LIKE ?
          OR al.table_name LIKE ?
          OR u.name LIKE ?
          OR u.phone_number LIKE ?
          OR al.old_data LIKE ?
          OR al.new_data LIKE ?
        )
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const params = [
      req.storeId,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      parseInt(limit),
      parseInt(offset)
    ];

    // 总数查询
    const countQuery = query.replace('SELECT al.*, u.phone_number, u.name as user_name, u.role as user_role', 'SELECT COUNT(*) as total')
                           .replace('ORDER BY al.created_at DESC LIMIT ? OFFSET ?', '');
    const countParams = params.slice(0, -2);
    const countResult = await db.get(countQuery, countParams);

    const logs = await db.query(query, params);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('搜索审计日志错误:', error);
    res.status(500).json({
      error: '搜索审计日志失败',
      code: 'SEARCH_AUDIT_LOGS_ERROR'
    });
  }
});

// 获取详细操作记录
router.get('/:id', requireAuditPermission, async (req, res) => {
  try {
    const { id } = req.params;

    const log = await db.get(
      `SELECT
        al.*,
        u.phone_number,
        u.name as user_name,
        u.role as user_role
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.id = ? AND u.store_id = ?`,
      [id, req.storeId]
    );

    if (!log) {
      return res.status(404).json({
        error: '日志记录不存在',
        code: 'LOG_NOT_FOUND'
      });
    }

    // 尝试解析JSON数据
    let oldData = null;
    let newData = null;

    try {
      if (log.old_data) oldData = JSON.parse(log.old_data);
      if (log.new_data) newData = JSON.parse(log.new_data);
    } catch (e) {
      // 解析失败，保持原样
    }

    // 获取相关记录详情
    let relatedRecord = null;
    if (log.table_name && log.record_id) {
      try {
        let tableQuery = '';
        switch (log.table_name) {
          case 'dogs':
            tableQuery = `SELECT name, owner, phone FROM dogs WHERE id = ?`;
            break;
          case 'bookings':
            tableQuery = `SELECT id, check_in_time, check_out_time FROM bookings WHERE id = ?`;
            break;
          case 'rooms':
            tableQuery = `SELECT number, type, status FROM rooms WHERE id = ?`;
            break;
          case 'users':
            tableQuery = `SELECT name, phone_number, role FROM users WHERE id = ?`;
            break;
        }

        if (tableQuery) {
          relatedRecord = await db.get(tableQuery, [log.record_id]);
        }
      } catch (e) {
        console.error('获取相关记录错误:', e);
      }
    }

    const response = {
      id: log.id,
      user_info: {
        id: log.user_id,
        phone: log.phone_number,
        name: log.user_name,
        role: log.user_role
      },
      action: log.action,
      table_name: log.table_name,
      record_id: log.record_id,
      old_data: oldData || log.old_data,
      new_data: newData || log.new_data,
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      created_at: log.created_at,
      related_record: relatedRecord
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('获取日志详情错误:', error);
    res.status(500).json({
      error: '获取日志详情失败',
      code: 'GET_LOG_DETAIL_ERROR'
    });
  }
});

// 清理旧日志（仅超级管理员）
router.delete('/cleanup', requirePermission('can_manage_users'), async (req, res) => {
  try {
    // 只允许超级管理员执行清理
    if (req.userRole !== 'super_admin') {
      return res.status(403).json({
        error: '只有超级管理员可以清理日志',
        code: 'PERMISSION_DENIED'
      });
    }

    const { days_to_keep = 90 } = req.body;

    if (days_to_keep < 7) {
      return res.status(400).json({
        error: '最少保留7天日志',
        code: 'MIN_DAYS_REQUIRED'
      });
    }

    // 计算删除日期
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days_to_keep);

    // 删除旧日志
    const result = await db.run(
      `DELETE FROM audit_logs
       WHERE created_at < ? AND user_id IN (
         SELECT id FROM users WHERE store_id = ?
       )`,
      [cutoffDate.toISOString(), req.storeId]
    );

    res.json({
      success: true,
      message: `已清理${result.changes}条${days_to_keep}天前的日志记录`,
      changes: result.changes
    });
  } catch (error) {
    console.error('清理日志错误:', error);
    res.status(500).json({
      error: '清理日志失败',
      code: 'CLEANUP_AUDIT_LOGS_ERROR'
    });
  }
});

module.exports = router;
const db = require('../config/database');

// 审计日志中间件
const auditLog = (action, tableName = null, getRecordId = null) => {
  return async (req, res, next) => {
    // 保存原始的res.json方法
    const originalJson = res.json;

    // 获取请求开始时间
    const startTime = Date.now();

    // 获取用户IP和User-Agent
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // 覆盖res.json以捕获响应数据
    res.json = function(data) {
      // 恢复原始方法
      res.json = originalJson;

      // 异步记录日志（不阻塞响应）
      setImmediate(async () => {
        try {
          // 计算请求耗时
          const duration = Date.now() - startTime;

          // 获取记录ID
          let recordId = null;
          if (getRecordId) {
            if (typeof getRecordId === 'function') {
              recordId = getRecordId(req, data);
            } else {
              recordId = getRecordId;
            }
          } else if (req.params.id) {
            recordId = req.params.id;
          }

          // 准备数据变化记录
          let oldData = null;
          let newData = null;

          // 对于创建和更新操作，记录数据变化
          if (action.includes('create') || action.includes('update')) {
            if (req.body && Object.keys(req.body).length > 0) {
              newData = JSON.stringify(req.body);
            }
          }

          // 对于删除操作，可以记录被删除的数据
          if (action.includes('delete')) {
            // 在实际删除前获取旧数据需要额外处理
            // 这里简化处理
          }

          // 插入审计日志
          await db.run(
            `INSERT INTO audit_logs
             (user_id, action, table_name, record_id, old_data, new_data, ip_address, user_agent, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
              req.userId || null,
              `${action} (${duration}ms)`,
              tableName,
              recordId,
              oldData,
              newData,
              ipAddress,
              userAgent
            ]
          );
        } catch (error) {
          console.error('记录审计日志失败:', error);
          // 不抛出错误，避免影响主流程
        }
      });

      // 调用原始方法返回响应
      return originalJson.call(this, data);
    };

    next();
  };
};

// 查询审计日志（供店长查看员工操作记录）
const getAuditLogs = async (options = {}) => {
  const {
    userId = null,
    action = null,
    tableName = null,
    startDate = null,
    endDate = null,
    page = 1,
    limit = 50
  } = options;

  let query = `
    SELECT
      al.*,
      u.phone_number,
      u.name as user_name,
      u.role as user_role
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    query += ' AND al.user_id = ?';
    params.push(userId);
  }

  if (action) {
    query += ' AND al.action LIKE ?';
    params.push(`%${action}%`);
  }

  if (tableName) {
    query += ' AND al.table_name = ?';
    params.push(tableName);
  }

  if (startDate) {
    query += ' AND al.created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND al.created_at <= ?';
    params.push(endDate);
  }

  // 总数查询
  const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
  const countResult = await db.get(countQuery, params);

  // 分页
  const offset = (page - 1) * limit;
  query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const logs = await db.query(query, params);

  return {
    logs,
    pagination: {
      total: countResult.total,
      page,
      limit,
      pages: Math.ceil(countResult.total / limit)
    }
  };
};

module.exports = {
  auditLog,
  getAuditLogs
};
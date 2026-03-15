const { verifyToken, extractToken } = require('../utils/auth');
const db = require('../config/database');

// 认证中间件
const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        error: '未提供认证token',
        code: 'NO_TOKEN'
      });
    }

    // 验证token
    const decoded = verifyToken(token);

    // 检查用户是否存在且活跃
    const user = await db.get(
      'SELECT id, phone_number, name, role, store_id, is_active FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        error: '用户账号已停用',
        code: 'USER_INACTIVE'
      });
    }

    // 将用户信息附加到请求对象
    req.user = user;
    req.userId = user.id;
    req.userRole = user.role;
    req.storeId = user.store_id;

    next();
  } catch (error) {
    if (error.message.includes('invalid') || error.message.includes('expired')) {
      return res.status(401).json({
        error: '认证token无效或已过期',
        code: 'INVALID_TOKEN'
      });
    }

    console.error('认证中间件错误:', error);
    return res.status(500).json({
      error: '服务器认证错误',
      code: 'AUTH_ERROR'
    });
  }
};

// 权限检查中间件
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: '未认证',
        code: 'UNAUTHENTICATED'
      });
    }

    if (!roles.includes(req.userRole)) {
      return res.status(403).json({
        error: '权限不足',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: roles,
        current: req.userRole
      });
    }

    next();
  };
};

// 权限检查（基于权限字符串）
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: '未认证',
          code: 'UNAUTHENTICATED'
        });
      }

      // 如果是超级管理员，拥有所有权限
      if (req.userRole === 'super_admin') {
        return next();
      }

      // 获取用户权限
      const userWithPermissions = await db.get(
        'SELECT permissions FROM users WHERE id = ?',
        [req.userId]
      );

      if (!userWithPermissions || !userWithPermissions.permissions) {
        return res.status(403).json({
          error: '用户权限配置错误',
          code: 'PERMISSION_ERROR'
        });
      }

      const permissions = JSON.parse(userWithPermissions.permissions);

      // 检查特定权限
      if (!permissions[permission]) {
        return res.status(403).json({
          error: `缺少权限: ${permission}`,
          code: 'PERMISSION_DENIED'
        });
      }

      next();
    } catch (error) {
      console.error('权限检查错误:', error);
      return res.status(500).json({
        error: '权限检查失败',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
};

module.exports = {
  authenticate,
  requireRole,
  requirePermission
};
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { generateToken, verifyPassword } = require('../utils/auth');
const { auditLog } = require('../middleware/audit');

// 用户登录
router.post('/login', auditLog('user_login'), async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    // 验证输入
    if (!phone_number || !password) {
      return res.status(400).json({
        error: '手机号和密码不能为空',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // 查询用户
    const user = await db.get(
      `SELECT
        id,
        phone_number,
        password_hash,
        name,
        role,
        store_id,
        permissions,
        is_active
       FROM users
       WHERE phone_number = ?`,
      [phone_number]
    );

    if (!user) {
      return res.status(401).json({
        error: '手机号或密码错误',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // 检查用户是否活跃
    if (!user.is_active) {
      return res.status(401).json({
        error: '用户账号已停用',
        code: 'ACCOUNT_DISABLED'
      });
    }

    // 验证密码
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: '手机号或密码错误',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // 生成token
    const token = generateToken(user);

    // 返回用户信息（排除密码）
    const userResponse = {
      id: user.id,
      phone_number: user.phone_number,
      name: user.name,
      role: user.role,
      store_id: user.store_id,
      permissions: JSON.parse(user.permissions || '{}')
    };

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: userResponse
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      error: '登录失败，请稍后重试',
      code: 'LOGIN_ERROR'
    });
  }
});

// 用户登出
router.post('/logout', auditLog('user_logout'), (req, res) => {
  // 由于使用无状态JWT，客户端只需删除token即可
  res.json({
    success: true,
    message: '登出成功'
  });
});

// 获取当前用户信息
router.get('/me', async (req, res) => {
  try {
    // 从Authorization头获取token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '未提供认证token',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];
    const { verifyToken } = require('../utils/auth');

    // 验证token
    const decoded = verifyToken(token);

    // 查询用户信息
    const user = await db.get(
      `SELECT
        id,
        phone_number,
        name,
        role,
        store_id,
        permissions,
        is_active
       FROM users
       WHERE id = ? AND is_active = 1`,
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({
        error: '用户不存在或已停用',
        code: 'USER_NOT_FOUND'
      });
    }

    const userResponse = {
      id: user.id,
      phone_number: user.phone_number,
      name: user.name,
      role: user.role,
      store_id: user.store_id,
      permissions: JSON.parse(user.permissions || '{}')
    };

    res.json({
      success: true,
      data: userResponse
    });
  } catch (error) {
    if (error.message.includes('invalid') || error.message.includes('expired')) {
      return res.status(401).json({
        error: '认证token无效或已过期',
        code: 'INVALID_TOKEN'
      });
    }

    console.error('获取用户信息错误:', error);
    res.status(500).json({
      error: '获取用户信息失败',
      code: 'GET_USER_ERROR'
    });
  }
});

// 修改密码
router.post('/change-password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        error: '当前密码和新密码不能为空',
        code: 'MISSING_PASSWORDS'
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        error: '新密码至少需要6位字符',
        code: 'PASSWORD_TOO_SHORT'
      });
    }

    // 从token获取用户ID
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '未提供认证token',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];
    const { verifyToken, hashPassword, verifyPassword } = require('../utils/auth');
    const decoded = verifyToken(token);

    // 查询当前用户
    const user = await db.get(
      'SELECT id, password_hash FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 验证当前密码
    const isValidPassword = await verifyPassword(current_password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: '当前密码错误',
        code: 'INCORRECT_CURRENT_PASSWORD'
      });
    }

    // 加密新密码
    const newPasswordHash = await hashPassword(new_password);

    // 更新密码
    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?',
      [newPasswordHash, user.id]
    );

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({
      error: '修改密码失败',
      code: 'CHANGE_PASSWORD_ERROR'
    });
  }
});

module.exports = router;
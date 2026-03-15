const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { hashPassword } = require('../utils/auth');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// 所有路由都需要认证
router.use(authenticate);

// 只有店长可以管理用户
const requireManager = requireRole('super_admin', 'manager');

// 获取用户列表（店长权限）
router.get('/', requireManager, auditLog('list_users', 'users'), async (req, res) => {
  try {
    const { role, is_active, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
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
    `;
    const params = [req.storeId];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    // 总数查询
    const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
    const countResult = await db.get(countQuery, params);

    // 分页查询
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const users = await db.query(query, params);

    res.json({
      success: true,
      data: users,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({
      error: '获取用户列表失败',
      code: 'GET_USERS_ERROR'
    });
  }
});

// 获取单个用户信息
router.get('/:id', requireManager, auditLog('view_user', 'users', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db.get(
      `SELECT
        id,
        phone_number,
        name,
        role,
        store_id,
        permissions,
        is_active,
        created_at,
        updated_at
       FROM users
       WHERE id = ? AND store_id = ?`,
      [id, req.storeId]
    );

    if (!user) {
      return res.status(404).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 解析permissions字段
    if (user.permissions) {
      user.permissions = JSON.parse(user.permissions);
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      error: '获取用户信息失败',
      code: 'GET_USER_ERROR'
    });
  }
});

// 创建用户（店长添加员工）
router.post('/', requireManager, auditLog('create_user', 'users'), async (req, res) => {
  try {
    const { phone_number, name, role, password, permissions } = req.body;

    // 验证输入
    if (!phone_number || !name || !role || !password) {
      return res.status(400).json({
        error: '手机号、姓名、角色和密码为必填项',
        code: 'MISSING_FIELDS'
      });
    }

    // 验证角色
    const allowedRoles = ['manager', 'staff_edit', 'staff_view'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        error: `角色必须是以下之一: ${allowedRoles.join(', ')}`,
        code: 'INVALID_ROLE'
      });
    }

    // 检查手机号是否已存在
    const existingUser = await db.get(
      'SELECT id FROM users WHERE phone_number = ?',
      [phone_number]
    );

    if (existingUser) {
      return res.status(400).json({
        error: '该手机号已注册',
        code: 'PHONE_NUMBER_EXISTS'
      });
    }

    // 根据角色设置默认权限
    let defaultPermissions = {};
    if (role === 'manager') {
      defaultPermissions = {
        can_export: true,
        can_delete: true,
        can_edit: true,
        can_create: true,
        can_view: true,
        can_manage_users: true,
        can_view_audit: true
      };
    } else if (role === 'staff_edit') {
      // 员工A：可编辑但不可删除和导出
      defaultPermissions = {
        can_export: false,
        can_delete: false,
        can_edit: true,
        can_create: true,
        can_view: true,
        can_manage_users: false,
        can_view_audit: false
      };
    } else if (role === 'staff_view') {
      // 员工B：只读
      defaultPermissions = {
        can_export: false,
        can_delete: false,
        can_edit: false,
        can_create: false,
        can_view: true,
        can_manage_users: false,
        can_view_audit: false
      };
    }

    // 合并自定义权限（如果有）
    const finalPermissions = { ...defaultPermissions, ...(permissions || {}) };

    // 加密密码
    const passwordHash = await hashPassword(password);

    // 创建用户
    const result = await db.run(
      `INSERT INTO users
       (phone_number, password_hash, name, role, store_id, permissions, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        phone_number,
        passwordHash,
        name,
        role,
        req.storeId,
        JSON.stringify(finalPermissions),
        1 // 默认激活
      ]
    );

    // 获取创建的用户
    const newUser = await db.get(
      `SELECT
        id,
        phone_number,
        name,
        role,
        store_id,
        is_active,
        created_at
       FROM users
       WHERE id = ?`,
      [result.lastID]
    );

    res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: newUser
    });
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({
      error: '创建用户失败',
      code: 'CREATE_USER_ERROR'
    });
  }
});

// 更新用户信息
router.put('/:id', requireManager, auditLog('update_user', 'users', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, is_active, permissions } = req.body;

    // 检查用户是否存在且属于当前门店
    const existingUser = await db.get(
      'SELECT id, role FROM users WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!existingUser) {
      return res.status(404).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 不能修改超级管理员
    if (existingUser.role === 'super_admin') {
      return res.status(403).json({
        error: '不能修改超级管理员',
        code: 'CANNOT_MODIFY_SUPER_ADMIN'
      });
    }

    // 构建更新字段
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (role !== undefined) {
      // 验证角色
      const allowedRoles = ['manager', 'staff_edit', 'staff_view'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          error: `角色必须是以下之一: ${allowedRoles.join(', ')}`,
          code: 'INVALID_ROLE'
        });
      }
      updates.push('role = ?');
      params.push(role);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    if (permissions !== undefined) {
      updates.push('permissions = ?');
      params.push(JSON.stringify(permissions));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: '没有提供更新字段',
        code: 'NO_UPDATES'
      });
    }

    updates.push('updated_at = datetime("now")');
    params.push(id);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ? AND store_id = ?`;
    params.push(req.storeId);

    await db.run(query, params);

    // 获取更新后的用户
    const updatedUser = await db.get(
      `SELECT
        id,
        phone_number,
        name,
        role,
        store_id,
        is_active,
        permissions,
        updated_at
       FROM users
       WHERE id = ?`,
      [id]
    );

    if (updatedUser.permissions) {
      updatedUser.permissions = JSON.parse(updatedUser.permissions);
    }

    res.json({
      success: true,
      message: '用户更新成功',
      data: updatedUser
    });
  } catch (error) {
    console.error('更新用户错误:', error);
    res.status(500).json({
      error: '更新用户失败',
      code: 'UPDATE_USER_ERROR'
    });
  }
});

// 删除用户（软删除 - 设为停用）
router.delete('/:id', requireManager, auditLog('delete_user', 'users', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;

    // 检查用户是否存在且属于当前门店
    const existingUser = await db.get(
      'SELECT id, role FROM users WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!existingUser) {
      return res.status(404).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 不能删除超级管理员
    if (existingUser.role === 'super_admin') {
      return res.status(403).json({
        error: '不能删除超级管理员',
        code: 'CANNOT_DELETE_SUPER_ADMIN'
      });
    }

    // 不能删除自己
    if (parseInt(id) === req.userId) {
      return res.status(403).json({
        error: '不能删除自己的账号',
        code: 'CANNOT_DELETE_SELF'
      });
    }

    // 软删除：设为停用
    await db.run(
      'UPDATE users SET is_active = 0, updated_at = datetime("now") WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: '用户已停用'
    });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({
      error: '删除用户失败',
      code: 'DELETE_USER_ERROR'
    });
  }
});

// 重置用户密码（店长权限）
router.post('/:id/reset-password', requireManager, auditLog('reset_password', 'users', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password) {
      return res.status(400).json({
        error: '新密码不能为空',
        code: 'MISSING_NEW_PASSWORD'
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        error: '新密码至少需要6位字符',
        code: 'PASSWORD_TOO_SHORT'
      });
    }

    // 检查用户是否存在且属于当前门店
    const existingUser = await db.get(
      'SELECT id, role FROM users WHERE id = ? AND store_id = ?',
      [id, req.storeId]
    );

    if (!existingUser) {
      return res.status(404).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 不能重置超级管理员密码（除非是超级管理员自己）
    if (existingUser.role === 'super_admin' && req.userRole !== 'super_admin') {
      return res.status(403).json({
        error: '不能重置超级管理员密码',
        code: 'CANNOT_RESET_SUPER_ADMIN_PASSWORD'
      });
    }

    // 加密新密码
    const passwordHash = await hashPassword(new_password);

    // 更新密码
    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?',
      [passwordHash, id]
    );

    res.json({
      success: true,
      message: '密码重置成功'
    });
  } catch (error) {
    console.error('重置密码错误:', error);
    res.status(500).json({
      error: '重置密码失败',
      code: 'RESET_PASSWORD_ERROR'
    });
  }
});

module.exports = router;
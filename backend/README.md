# 狗狗寄养中心后端API服务

为微信小程序"嘤嘤大师狗狗俱乐部"提供完整的后端API服务，包括用户管理、狗狗档案、房间管理、预约系统、权限控制和数据导出功能。

## 功能特性

### 1. 用户权限系统
- **超级管理员**: 拥有所有权限，包括系统设置
- **店长**: 拥有所有操作权限，包括数据导出和员工管理
- **员工A**: 可编辑、创建、查看，但不能删除和导出数据
- **员工B**: 只能查看数据，不能编辑、创建、删除或导出

### 2. 核心功能
- 用户认证与授权（JWT）
- 狗狗档案管理
- 房间管理
- 预约系统（入住/离店/取消）
- 仪表盘统计数据
- 操作审计日志（店长可查看所有员工操作记录）
- 一键数据导出（Excel格式）

### 3. 安全特性
- JWT令牌认证
- 基于角色的权限控制
- 操作审计日志
- 请求限流
- CORS安全配置
- SQL注入防护

## 技术栈

- **运行时**: Node.js 16+
- **框架**: Express.js
- **数据库**: SQLite3（可扩展至PostgreSQL/MySQL）
- **认证**: JWT + bcryptjs
- **文件导出**: xlsx (Excel), pdfkit (PDF)
- **安全**: helmet, express-rate-limit, cors

## 快速开始

### 1. 安装依赖
```bash
cd backend
npm install
```

### 2. 环境配置
复制环境变量文件：
```bash
cp .env.example .env
```

编辑 `.env` 文件，设置你的配置：
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
PORT=3000
```

### 3. 启动服务
```bash
# 开发模式（带热重载）
npm run dev

# 生产模式
npm start
```

服务将在 http://localhost:3000 启动

### 4. 健康检查
访问 http://localhost:3000/health 检查服务状态

## API接口文档

### 认证相关
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/me` - 获取当前用户信息

### 用户管理（店长权限）
- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户（软删除）
- `POST /api/users/:id/reset-password` - 重置密码

### 狗狗档案管理
- `GET /api/dogs` - 获取狗狗列表
- `POST /api/dogs` - 创建狗狗档案
- `PUT /api/dogs/:id` - 更新狗狗档案
- `DELETE /api/dogs/:id` - 删除狗狗档案
- `POST /api/dogs/batch-import` - 批量导入

### 房间管理
- `GET /api/rooms` - 获取房间列表
- `POST /api/rooms` - 创建房间
- `PUT /api/rooms/:id` - 更新房间
- `DELETE /api/rooms/:id` - 删除房间
- `POST /api/rooms/available` - 查询空闲房间

### 预约管理
- `GET /api/bookings` - 获取预约列表
- `POST /api/bookings` - 创建预约
- `PUT /api/bookings/:id` - 更新预约
- `DELETE /api/bookings/:id` - 删除预约
- `POST /api/bookings/:id/checkin` - 确认入住
- `POST /api/bookings/:id/checkout` - 确认离店
- `POST /api/bookings/:id/cancel` - 取消预约

### 仪表盘
- `GET /api/dashboard/stats` - 获取统计数据
- `GET /api/dashboard/reminders` - 获取今日提醒
- `GET /api/dashboard/today-checkins` - 今日应入住列表
- `GET /api/dashboard/late-checkins` - 今日未入住列表
- `GET /api/dashboard/in-store-dogs` - 在店狗狗列表
- `GET /api/dashboard/daily-view/:date` - 每日视图
- `GET /api/dashboard/revenue-stats` - 收入统计

### 数据导出（店长权限）
- `GET /api/export/dogs/excel` - 导出狗狗档案Excel
- `GET /api/export/bookings/excel` - 导出预约记录Excel
- `GET /api/export/rooms/excel` - 导出房间信息Excel
- `GET /api/export/audit-logs/excel` - 导出审计日志Excel
- `GET /api/export/users/excel` - 导出用户列表Excel
- `GET /api/export/all/zip` - 一键导出所有数据（ZIP）

### 审计日志（店长权限）
- `GET /api/audit` - 获取审计日志
- `GET /api/audit/user/:user_id` - 获取特定用户日志
- `GET /api/audit/stats` - 获取操作统计
- `GET /api/audit/search` - 搜索日志
- `GET /api/audit/:id` - 获取日志详情
- `DELETE /api/audit/cleanup` - 清理旧日志

## 权限系统说明

### 角色定义
1. **super_admin** (超级管理员)
   - 所有权限，包括系统设置
   - 默认账号: 13800138000 / admin123

2. **manager** (店长)
   - 所有操作权限
   - 可以管理员工账号
   - 可以导出数据
   - 可以查看审计日志

3. **staff_edit** (员工A)
   - 可以创建、编辑、查看
   - 不能删除数据
   - 不能导出数据
   - 不能管理用户

4. **staff_view** (员工B)
   - 只能查看数据
   - 不能创建、编辑、删除
   - 不能导出数据

### 权限字段
每个用户都有以下权限字段（JSON格式）：
```json
{
  "can_export": true/false,
  "can_delete": true/false,
  "can_edit": true/false,
  "can_create": true/false,
  "can_view": true/false,
  "can_manage_users": true/false,
  "can_view_audit": true/false
}
```

## 数据库初始化

服务首次启动时会自动创建以下表：

1. **users** - 用户表
2. **stores** - 门店表
3. **dogs** - 狗狗档案表
4. **rooms** - 房间表
5. **bookings** - 预约表
6. **audit_logs** - 审计日志表

并创建默认数据：
- 默认门店：嘤嘤大师狗狗俱乐部
- 默认超级管理员：13800138000 / admin123

## 部署说明

### 开发环境
```bash
npm run dev
```

### 生产环境
1. 设置生产环境变量
2. 使用PM2进程管理：
```bash
npm install -g pm2
pm2 start server.js --name dog-board-api
```

### Docker部署
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 微信小程序对接

### 1. 配置请求域名
在微信小程序后台配置以下域名：
- request合法域名：你的API域名
- uploadFile合法域名：你的API域名（如果需要上传文件）
- downloadFile合法域名：你的API域名（如果需要下载导出文件）

### 2. 前端请求示例
```javascript
// 登录
wx.request({
  url: 'https://your-api.com/api/auth/login',
  method: 'POST',
  data: {
    phone_number: '13800138000',
    password: 'admin123'
  },
  success: (res) => {
    const token = res.data.data.token;
    // 保存token到本地存储
    wx.setStorageSync('token', token);
  }
});

// 获取狗狗列表（带认证）
wx.request({
  url: 'https://your-api.com/api/dogs',
  method: 'GET',
  header: {
    'Authorization': 'Bearer ' + wx.getStorageSync('token')
  }
});
```

### 3. 错误处理
所有API响应都包含以下格式：
```json
{
  "success": true/false,
  "message": "操作描述",
  "data": {}, // 成功时的数据
  "error": "错误信息", // 失败时的错误信息
  "code": "错误代码" // 失败时的错误代码
}
```

常见错误代码：
- `NO_TOKEN`: 未提供认证token
- `INVALID_TOKEN`: token无效或过期
- `PERMISSION_DENIED`: 权限不足
- `USER_NOT_FOUND`: 用户不存在

## 数据导出功能

店长可以通过以下方式导出数据：

### Excel导出
- 狗狗档案：包含所有狗狗信息
- 预约记录：可按日期筛选
- 房间信息：包含房间状态和价格
- 用户列表：所有员工信息
- 审计日志：所有操作记录

### 一键导出
提供所有数据的打包下载（实际部署中需要实现ZIP打包）

## 审计日志功能

店长可以：
1. 查看所有员工的操作记录
2. 按用户、操作类型、日期筛选
3. 查看详细的操作前后数据变化
4. 获取操作统计报表
5. 清理旧日志（保留最近90天）

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查database目录权限
   - 检查SQLite3版本

2. **JWT认证失败**
   - 检查JWT_SECRET配置
   - 检查token格式（Bearer token）

3. **CORS错误**
   - 检查CORS_ORIGIN配置
   - 确保微信小程序域名已添加

4. **文件导出失败**
   - 检查temp目录权限
   - 检查磁盘空间

### 日志查看
```bash
# 查看错误日志
tail -f logs/error.log

# 查看访问日志
tail -f logs/access.log
```

## 扩展开发

### 添加新API
1. 在`routes/`目录创建新路由文件
2. 在`server.js`中注册路由
3. 添加相应的权限控制

### 更换数据库
当前使用SQLite3，可扩展至其他数据库：
1. 修改`config/database.js`中的连接配置
2. 更新SQL语句语法
3. 运行数据库迁移脚本

### 添加新导出格式
1. 在`routes/export.js`中添加新路由
2. 使用相应的库（如pdfkit生成PDF）
3. 设置正确的Content-Type头

## 许可证

MIT License

## 支持

如有问题，请联系开发团队。
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const dogRoutes = require('./routes/dogs');
const roomRoutes = require('./routes/rooms');
const bookingRoutes = require('./routes/bookings');
const dashboardRoutes = require('./routes/dashboard');
const exportRoutes = require('./routes/export');
const auditRoutes = require('./routes/audit');

// 导入数据库
const db = require('./config/database');

// 初始化Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 安全中间件
app.use(helmet());

// CORS配置 - 允许所有来源（开发环境）
const corsOptions = {
  origin: true,  // 允许所有来源
  credentials: true
};
app.use(cors(corsOptions));

// 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求限流
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100次请求
  message: '请求过于频繁，请稍后再试'
});
app.use('/api/', limiter);

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 健康检查
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'dog-board-api'
  });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dogs', dogRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/audit', auditRoutes);

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: '接口不存在',
    path: req.originalUrl
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err.stack);

  const statusCode = err.statusCode || 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    await db.initialize();

    app.listen(PORT, () => {
      console.log(`
      🚀 狗狗寄养中心API服务已启动
      📡 地址: http://localhost:${PORT}
      📊 健康检查: http://localhost:${PORT}/health
      📝 API文档: http://localhost:${PORT}/api/docs (待实现)
      📅 时间: ${new Date().toLocaleString()}
      `);
    });
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
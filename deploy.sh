#!/bin/bash

# 狗狗寄养中心后端部署脚本
# 在服务器上执行此脚本以部署后端API服务

set -e  # 遇到错误时退出

echo "========================================"
echo "开始部署狗狗寄养中心后端API服务"
echo "========================================"

# 1. 更新系统包
echo "步骤 1/9: 更新系统包..."
apt-get update
apt-get upgrade -y

# 2. 安装必要的软件
echo "步骤 2/9: 安装必要软件..."
apt-get install -y curl git wget gnupg

# 3. 安装Node.js 18.x
echo "步骤 3/9: 安装Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# 验证Node.js安装
echo "Node.js版本: $(node --version)"
echo "npm版本: $(npm --version)"

# 4. 安装PM2（进程管理）
echo "步骤 4/9: 安装PM2..."
npm install -g pm2

# 5. 克隆代码仓库
echo "步骤 5/9: 克隆代码仓库..."
if [ -d "/opt/dog_board_miniprogram" ]; then
    echo "目录已存在，更新代码..."
    cd /opt/dog_board_miniprogram
    git pull origin main
else
    echo "克隆新仓库..."
    git clone https://github.com/seanweixiaowei/dog_board_miniprogram.git /opt/dog_board_miniprogram
    cd /opt/dog_board_miniprogram
fi

# 6. 安装后端依赖
echo "步骤 6/9: 安装后端依赖..."
cd /opt/dog_board_miniprogram/backend
npm install --production

# 7. 配置环境变量
echo "步骤 7/9: 配置环境变量..."
if [ ! -f "/opt/dog_board_miniprogram/backend/.env" ]; then
    echo "创建环境变量文件..."
    cp /opt/dog_board_miniprogram/backend/.env.example /opt/dog_board_miniprogram/backend/.env

    # 生成安全的JWT密钥
    JWT_SECRET=$(openssl rand -base64 32)
    # 替换.env文件中的JWT_SECRET
    sed -i "s|your-super-secret-jwt-key-change-in-production|${JWT_SECRET}|g" /opt/dog_board_miniprogram/backend/.env

    echo "环境变量文件已创建，请编辑 /opt/dog_board_miniprogram/backend/.env 进行自定义配置"
    echo "生成的JWT密钥: ${JWT_SECRET}"
    echo "请妥善保存此密钥！"
else
    echo "环境变量文件已存在，跳过创建"
fi

# 8. 设置防火墙（如果需要）
echo "步骤 8/9: 配置防火墙..."
# 检查是否安装了ufw
if command -v ufw &> /dev/null; then
    echo "配置UFW防火墙..."
    ufw allow 22/tcp  # SSH
    ufw allow 3000/tcp  # API服务端口
    ufw --force enable
else
    echo "UFW未安装，跳过防火墙配置"
fi

# 9. 启动服务
echo "步骤 9/9: 启动服务..."
cd /opt/dog_board_miniprogram/backend

# 停止现有服务（如果存在）
pm2 delete dog-board-api 2>/dev/null || true

# 启动新服务
pm2 start server.js --name dog-board-api --watch

# 设置开机自启
pm2 startup
pm2 save

echo "========================================"
echo "部署完成！"
echo "========================================"
echo ""
echo "服务信息："
echo "- API服务运行在: http://$(curl -s ifconfig.me):3000"
echo "- 健康检查: http://$(curl -s ifconfig.me):3000/health"
echo "- PM2管理: pm2 status (查看状态)"
echo "- 查看日志: pm2 logs dog-board-api"
echo "- 重启服务: pm2 restart dog-board-api"
echo "- 停止服务: pm2 stop dog-board-api"
echo ""
echo "API接口："
echo "- 登录: POST /api/auth/login"
echo "- 获取狗狗列表: GET /api/dogs"
echo "- 创建预约: POST /api/bookings"
echo "- 数据导出: GET /api/export/* (需要店长权限)"
echo ""
echo "默认管理员账号："
echo "- 手机号: 13800138000"
echo "- 密码: admin123"
echo ""
echo "重要提醒："
echo "1. 请确保服务器安全组/防火墙已开放3000端口"
echo "2. 建议配置域名和HTTPS证书"
echo "3. 定期备份数据库文件: /opt/dog_board_miniprogram/backend/database/dog_board.db"
echo "4. 生产环境请修改默认管理员密码"
echo "========================================"
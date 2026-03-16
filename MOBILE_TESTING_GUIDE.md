# 微信小程序手机真机测试指南

## 📱 问题概述

在微信开发者工具中可以正常登录，但手机真机测试时提示"网络连接失败"。这是由于：

1. **HTTPS要求**：微信小程序真机环境必须使用HTTPS协议
2. **域名备案要求**：中国服务器要求域名必须完成ICP备案
3. **域名限制**：微信小程序只允许访问后台配置的"request合法域名"

## 🔧 已完成的配置

### 1. LocalTunnel隧道服务
已在服务器上配置LocalTunnel隧道，提供HTTPS地址：
```
https://dog-board-api.loca.lt
```

### 2. 小程序设置页面
已添加设置页面 (`pages/settings/settings`)，允许动态修改API地址：
- 登录后进入仪表盘
- 点击右上角"设置"按钮
- 修改API地址并测试连接

### 3. 后端CORS配置
已配置后端允许所有来源访问，支持跨域请求。

## 🚀 测试方案

### 方案A：真机调试模式（推荐优先尝试）
**步骤**：
1. 在微信开发者工具中打开项目
2. 点击顶部工具栏的"真机调试"按钮
3. 手机微信扫描二维码
4. 在手机上测试登录功能

**优点**：
- 真机调试模式可能绕过某些限制
- 无需配置HTTPS和域名
- 快速验证功能是否正常

### 方案B：使用LocalTunnel隧道（可能被拦截）
**步骤**：
1. 确保服务器LocalTunnel服务正常运行：
   ```bash
   ssh root@39.102.78.230 "/usr/local/bin/check-tunnel-status.sh"
   ```
2. 在小程序设置页面输入地址：
   ```
   https://dog-board-api.loca.lt
   ```
3. 点击"测试连接"验证
4. 如果连接失败，说明域名被备案系统拦截

**注意**：
- LocalTunnel提供的`.loca.lt`域名未备案
- 中国服务器会拦截未备案域名访问
- 如果被拦截，需要尝试其他方案

### 方案C：部署到海外服务器（推荐长期方案）
**步骤**：
1. 购买海外服务器（推荐香港、新加坡）
   - 腾讯云国际版
   - 阿里云国际版
   - AWS/Azure/Google Cloud
2. 将后端代码部署到海外服务器
3. 配置新的API地址
4. 在小程序后台添加合法域名

**海外服务器配置脚本**：
```bash
# 1. 登录海外服务器
ssh user@overseas-server

# 2. 克隆代码
git clone https://github.com/Seanweixiaowei/dog_board_miniprogram.git

# 3. 部署后端
cd dog_board_miniprogram/backend
npm install
npm start

# 4. 使用PM2持久化
npm install -g pm2
pm2 start server.js --name dog-board-api
```

### 方案D：使用已备案的域名
**步骤**：
1. 购买域名并完成ICP备案（需7-20个工作日）
2. 配置SSL证书（Let's Encrypt免费）
3. 配置Nginx反向代理
4. 在小程序后台添加合法域名

**Nginx配置示例**：
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📋 操作步骤总结

### 立即测试（方案A）
1. 微信开发者工具 → 真机调试 → 手机扫码测试
2. 如果功能正常，说明代码逻辑正确

### 短期测试（方案B）
1. 检查LocalTunnel状态：`check-tunnel-status.sh`
2. 小程序设置页面配置LocalTunnel地址
3. 测试连接，如果被拦截则使用方案A

### 长期方案（方案C/D）
1. 部署海外服务器或购买备案域名
2. 配置HTTPS和反向代理
3. 小程序后台添加合法域名
4. 小程序设置页面更新API地址

## 🔍 故障排除

### 1. LocalTunnel服务状态检查
```bash
# 检查服务状态
ssh root@39.102.78.230 "systemctl status localtunnel"

# 查看日志
ssh root@39.102.78.230 "journalctl -u localtunnel --no-pager -n 20"

# 重启服务
ssh root@39.102.78.230 "systemctl restart localtunnel"
```

### 2. 后端API状态检查
```bash
# 检查PM2进程
ssh root@39.102.78.230 "pm2 list"

# 查看后端日志
ssh root@39.102.78.230 "pm2 logs dog-board-api --lines 20"

# 重启后端
ssh root@39.102.78.230 "pm2 restart dog-board-api"
```

### 3. 网络连接测试
```bash
# 测试本地HTTP连接
curl http://39.102.78.230:3000/health

# 测试LocalTunnel HTTPS连接
curl -k https://dog-board-api.loca.lt/health

# 测试API登录
curl -X POST https://dog-board-api.loca.lt/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"13800138000","password":"admin123"}'
```

### 4. 小程序调试
1. 手机打开调试模式：微信 → 发现 → 小程序 → 右上角菜单 → 打开调试
2. 查看手机控制台日志
3. 检查网络请求详情

## 📞 测试账号

### 管理员账号
- 手机号：`13800138000`
- 密码：`admin123`
- 权限：超级管理员（所有权限）

### 员工账号
- 手机号：`13800138001`
- 密码：`viewer123`
- 权限：只读权限

## ⚠️ 重要提醒

1. **备案问题**：中国境内的服务器必须使用已备案的域名
2. **HTTPS要求**：真机环境必须使用HTTPS，不能使用HTTP
3. **域名限制**：只能访问小程序后台配置的合法域名
4. **测试建议**：先使用真机调试模式验证功能逻辑

## 🔄 更新日志

- **2026-03-16**：创建LocalTunnel隧道服务，添加设置页面
- **2026-03-16**：修复WXML编译错误，优化CORS配置
- **2026-03-16**：添加手机真机测试指南

## 📚 相关资源

- [微信小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [微信小程序合法域名配置](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- [LocalTunnel文档](https://github.com/localtunnel/localtunnel)
- [Let's Encrypt SSL证书](https://letsencrypt.org/)
- [阿里云ICP备案](https://beian.aliyun.com/)

---

**如需进一步帮助，请提供具体的错误信息或测试结果。**
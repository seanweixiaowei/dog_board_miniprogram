// pages/login/login.js
const app = getApp();

Page({
  data: {
    phoneNumber: '',
    password: '',
    isLoggingIn: false,
    errorMessage: ''
  },

  onLoad() {
    // 检查是否已登录
    const userInfo = app.globalData.userInfo;
    if (userInfo && userInfo.phoneNumber) {
      this.redirectToMainPage(userInfo.role);
    }
  },

  // 手机号输入
  onPhoneInput(e) {
    this.setData({
      phoneNumber: e.detail.value.replace(/\D/g, '') // 只保留数字
    });
  },

  // 密码输入
  onPasswordInput(e) {
    this.setData({
      password: e.detail.value
    });
  },

  // 登录
  onLogin() {
    const { phoneNumber, password } = this.data;

    if (!phoneNumber) {
      this.setData({ errorMessage: '请输入手机号' });
      return;
    }

    if (!password) {
      this.setData({ errorMessage: '请输入密码' });
      return;
    }

    if (phoneNumber.length !== 11) {
      this.setData({ errorMessage: '手机号应为11位数字' });
      return;
    }

    this.setData({ isLoggingIn: true, errorMessage: '' });

    // 模拟网络请求
    setTimeout(() => {
      this.authenticateUser(phoneNumber, password);
      this.setData({ isLoggingIn: false });
    }, 500);
  },

  // 用户认证
  authenticateUser(phoneNumber, password) {
    // 预定义的授权用户列表
    // 店长账号：有所有权限
    // 员工账号：只有查看权限
    const authorizedUsers = {
      // 店长账号（全权限） - 最多2个
      '13800138000': {
        role: 'admin',
        name: '店长A',
        password: 'admin123' // 实际应用中密码应该加密存储
      },
      '13800138006': {
        role: 'admin',
        name: '店长B',
        password: 'admin123'
      },
      // 员工账号（只读权限） - 最多5个
      '13800138001': {
        role: 'viewer',
        name: '员工A',
        password: 'viewer123'
      },
      '13800138002': {
        role: 'viewer',
        name: '员工B',
        password: 'viewer123'
      },
      '13800138003': {
        role: 'viewer',
        name: '员工C',
        password: 'viewer123'
      },
      '13800138004': {
        role: 'viewer',
        name: '员工D',
        password: 'viewer123'
      },
      '13800138005': {
        role: 'viewer',
        name: '员工E',
        password: 'viewer123'
      }
    };

    const user = authorizedUsers[phoneNumber];

    if (!user) {
      this.setData({ errorMessage: '该手机号未授权使用本系统' });
      return;
    }

    if (user.password !== password) {
      this.setData({ errorMessage: '密码错误' });
      return;
    }

    // 登录成功
    const userInfo = {
      phoneNumber: phoneNumber,
      role: user.role,
      name: user.name,
      loginTime: new Date().toISOString()
    };

    // 保存到全局数据
    app.globalData.userInfo = userInfo;

    // 保存到本地存储（方便下次自动登录）
    try {
      wx.setStorageSync('userInfo', userInfo);
    } catch (e) {
      console.error('保存用户信息失败:', e);
    }

    // 跳转到主页面
    this.redirectToMainPage(user.role);
  },

  // 跳转到主页面
  redirectToMainPage(role) {
    // 根据角色跳转到不同页面
    // 管理员和查看者都进入仪表盘
    wx.switchTab({
      url: '/pages/dashboard/dashboard',
      success: () => {
        // 显示欢迎消息
        const welcomeMsg = role === 'admin' ? '店长，欢迎回来！' : '员工，欢迎查看系统！';
        wx.showToast({
          title: welcomeMsg,
          icon: 'success',
          duration: 2000
        });
      },
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({
          title: '跳转失败，请重试',
          icon: 'error'
        });
      }
    });
  },

  // 快速登录（测试用）
  quickLogin(role) {
    let phoneNumber, password;

    if (role === 'admin') {
      phoneNumber = '13800138000';
      password = 'admin123';
    } else {
      phoneNumber = '13800138001';
      password = 'viewer123';
    }

    this.setData({ phoneNumber, password });
    this.authenticateUser(phoneNumber, password);
  },

  // 店长快速登录（测试用）
  onAdminQuickLogin() {
    this.quickLogin('admin');
  },

  // 员工快速登录（测试用）
  onViewerQuickLogin() {
    this.quickLogin('viewer');
  },

  // 清除错误信息
  clearError() {
    if (this.data.errorMessage) {
      this.setData({ errorMessage: '' });
    }
  }
});
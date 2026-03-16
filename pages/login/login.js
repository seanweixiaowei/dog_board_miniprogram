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

    // 直接调用API登录，不使用setTimeout
    this.authenticateUser(phoneNumber, password);
  },

  // 用户认证（调用后端API）
  authenticateUser(phoneNumber, password) {
    const appInstance = getApp();

    // 调用后端API登录
    appInstance.apiRequest('POST', '/api/auth/login', {
      phone_number: phoneNumber,
      password: password
    }, false).then(response => {
      // 登录成功
      const { token, user } = response;

      // 保存token到全局数据
      appInstance.globalData.token = token;

      // 转换用户信息格式（兼容前端）
      const userInfo = {
        phoneNumber: user.phone_number,
        role: user.role, // 后端角色: super_admin, manager, staff_edit, staff_view
        name: user.name,
        id: user.id,
        store_id: user.store_id,
        permissions: user.permissions,
        loginTime: new Date().toISOString()
      };

      // 保存到全局数据
      appInstance.globalData.userInfo = userInfo;

      // 保存到本地存储（方便下次自动登录）
      try {
        wx.setStorageSync('userInfo', userInfo);
        wx.setStorageSync('token', token);
      } catch (e) {
        console.error('保存用户信息失败:', e);
      }

      // 跳转到主页面
      this.redirectToMainPage(user.role);
    }).catch(error => {
      // 登录失败
      console.error('登录失败:', error);

      let errorMessage = '登录失败';
      if (error.code === 'INVALID_CREDENTIALS') {
        errorMessage = '手机号或密码错误';
      } else if (error.code === 'ACCOUNT_DISABLED') {
        errorMessage = '用户账号已停用';
      } else if (error.code === 'NETWORK_ERROR') {
        errorMessage = '网络连接失败，请检查网络';
      } else if (error.message) {
        errorMessage = error.message;
      }

      this.setData({ errorMessage });
      this.setData({ isLoggingIn: false });
    });
  },

  // 跳转到主页面
  redirectToMainPage(role) {
    // 根据角色跳转到不同页面
    // 所有角色都进入仪表盘
    wx.switchTab({
      url: '/pages/dashboard/dashboard',
      success: () => {
        // 根据后端角色显示欢迎消息
        let welcomeMsg = '欢迎回来！';
        if (role === 'super_admin' || role === 'manager') {
          welcomeMsg = '店长，欢迎回来！';
        } else if (role === 'staff_edit' || role === 'staff_view') {
          welcomeMsg = '员工，欢迎查看系统！';
        }

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

    this.setData({ phoneNumber, password, isLoggingIn: true, errorMessage: '' });
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
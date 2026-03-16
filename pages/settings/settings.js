// pages/settings/settings.js
const app = getApp();

Page({
  data: {
    currentApiUrl: '',
    newApiUrl: '',
    hasCustomApiUrl: false,
    testResult: null
  },

  onLoad() {
    this.loadCurrentApiUrl();
  },

  onShow() {
    this.loadCurrentApiUrl();
  },

  // 加载当前API地址
  loadCurrentApiUrl() {
    const appInstance = getApp();
    const currentUrl = appInstance.getApiBaseUrl();
    const defaultUrl = appInstance.globalData.apiBaseUrl;

    // 检查是否有自定义地址
    try {
      const customApiUrl = wx.getStorageSync('customApiBaseUrl');
      const hasCustom = !!customApiUrl;

      this.setData({
        currentApiUrl: currentUrl,
        newApiUrl: customApiUrl || '',
        hasCustomApiUrl: hasCustom,
        defaultApiUrl: defaultUrl
      });
    } catch (e) {
      console.error('读取API地址失败:', e);
      this.setData({
        currentApiUrl: currentUrl,
        newApiUrl: '',
        hasCustomApiUrl: false,
        defaultApiUrl: defaultUrl
      });
    }
  },

  // API地址输入
  onApiUrlInput(e) {
    this.setData({
      newApiUrl: e.detail.value.trim(),
      testResult: null // 清除测试结果
    });
  },

  // 保存API地址
  saveApiUrl() {
    const { newApiUrl, currentApiUrl } = this.data;

    if (!newApiUrl) {
      wx.showToast({
        title: '请输入API地址',
        icon: 'none'
      });
      return;
    }

    // 验证URL格式
    if (!this.isValidUrl(newApiUrl)) {
      wx.showToast({
        title: 'URL格式不正确',
        icon: 'none'
      });
      return;
    }

    const appInstance = getApp();
    const success = appInstance.setApiBaseUrl(newApiUrl);

    if (success) {
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });
      this.loadCurrentApiUrl();
      this.setData({ testResult: null });
    } else {
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      });
    }
  },

  // 验证URL格式
  isValidUrl(url) {
    try {
      // 基本URL验证
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (e) {
      return false;
    }
  },

  // 恢复默认设置
  resetToDefault() {
    const { defaultApiUrl, currentApiUrl } = this.data;

    if (defaultApiUrl === currentApiUrl) {
      wx.showToast({
        title: '已是默认地址',
        icon: 'none'
      });
      return;
    }

    const appInstance = getApp();
    const success = appInstance.setApiBaseUrl(defaultApiUrl);

    if (success) {
      wx.showToast({
        title: '已恢复默认',
        icon: 'success'
      });
      this.loadCurrentApiUrl();
      this.setData({ testResult: null });
    } else {
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    }
  },

  // 清除自定义设置
  clearApiUrl() {
    const appInstance = getApp();
    const success = appInstance.clearApiBaseUrl();

    if (success) {
      wx.showToast({
        title: '已清除自定义设置',
        icon: 'success'
      });
      this.loadCurrentApiUrl();
      this.setData({ testResult: null });
    } else {
      wx.showToast({
        title: '清除失败',
        icon: 'error'
      });
    }
  },

  // 测试连接
  testConnection() {
    const { currentApiUrl } = this.data;

    if (!currentApiUrl) {
      wx.showToast({
        title: 'API地址为空',
        icon: 'none'
      });
      return;
    }

    this.setData({
      testResult: {
        success: false,
        message: '测试中...',
        details: ''
      }
    });

    // 测试健康检查接口
    const testUrl = `${currentApiUrl}/health`;

    wx.request({
      url: testUrl,
      method: 'GET',
      timeout: 10000, // 10秒超时
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({
            testResult: {
              success: true,
              message: '连接成功！API服务正常运行',
              details: `状态码: ${res.statusCode}`
            }
          });
        } else {
          this.setData({
            testResult: {
              success: false,
              message: '连接失败',
              details: `状态码: ${res.statusCode}`
            }
          });
        }
      },
      fail: (err) => {
        console.error('连接测试失败:', err);
        this.setData({
          testResult: {
            success: false,
            message: '连接失败',
            details: err.errMsg || '网络请求失败'
          }
        });
      }
    });
  },

  // 复制当前地址
  copyCurrentUrl() {
    const { currentApiUrl } = this.data;

    wx.setClipboardData({
      data: currentApiUrl,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      },
      fail: (err) => {
        wx.showToast({
          title: '复制失败',
          icon: 'error'
        });
      }
    });
  },

  // 返回登录页面
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  // 清除所有本地数据
  clearAllData() {
    wx.showModal({
      title: '确认清除',
      content: '将清除所有本地存储数据，包括登录状态和设置。确定要继续吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            // 清除所有相关存储
            wx.clearStorageSync();

            // 重置全局数据
            const appInstance = getApp();
            appInstance.globalData.userInfo = null;
            appInstance.globalData.token = null;
            appInstance.globalData.bookingNavigationData = null;

            wx.showToast({
              title: '已清除所有数据',
              icon: 'success'
            });

            // 重新加载当前页面
            this.loadCurrentApiUrl();
            this.setData({ testResult: null });

            // 跳转到登录页面
            setTimeout(() => {
              wx.reLaunch({
                url: '/pages/login/login'
              });
            }, 1500);

          } catch (e) {
            console.error('清除数据失败:', e);
            wx.showToast({
              title: '清除失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  // 显示使用说明
  showInstructions() {
    wx.showModal({
      title: '手机真机测试说明',
      content: '手机真机测试必须使用HTTPS协议。推荐使用内网穿透工具：\n\n1. 安装 ngrok: https://ngrok.com/\n2. 运行: ngrok http 3000\n3. 将生成的HTTPS地址填入设置',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
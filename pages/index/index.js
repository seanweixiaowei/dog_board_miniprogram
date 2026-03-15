// pages/index/index.js
const app = getApp();

Page({
  onLoad() {
    const app = getApp();

    // 检查用户是否已登录
    if (app.globalData.userInfo && app.globalData.userInfo.phoneNumber) {
      // 已登录，跳转到仪表盘
      wx.switchTab({
        url: '/pages/dashboard/dashboard'
      });
    } else {
      // 未登录，跳转到登录页面
      wx.reLaunch({
        url: '/pages/login/login'
      });
    }
  },

  // 导航方法
  navigateToDashboard() {
    wx.switchTab({
      url: '/pages/dashboard/dashboard'
    });
  },

  navigateToRooms() {
    wx.switchTab({
      url: '/pages/rooms/rooms'
    });
  },

  navigateToDogs() {
    wx.switchTab({
      url: '/pages/dogs/dogs'
    });
  },

  navigateToBooking() {
    wx.switchTab({
      url: '/pages/booking/booking'
    });
  },

  navigateToDaily() {
    wx.switchTab({
      url: '/pages/dashboard/dashboard'
    });
  }
});
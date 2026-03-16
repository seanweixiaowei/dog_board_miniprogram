// pages/dashboard/dashboard.js
const app = getApp();

Page({
  data: {
    stats: {
      totalRooms: 0,
      totalDogs: 0,
      occupiedRooms: 0,
      todayBookings: 0,
      availableRooms: 0,
      todayScheduledCheckins: 0,  // 今日应入住
      todayNotCheckedIn: 0,        // 今日未入住
      availableRoomsToday: 0,      // 今日空闲房间
      inStoreDogs: 0               // 在店狗狗
    },
    reminders: [],
    selectedDate: '',
    dailyData: null,
    roomTypeNames: {
      'standard': '标准庭院房',
      'deluxe': '豪华庭院房',
      'vip': '贵宾房'
    },
    roomTypeOptions: [
      { value: 'standard', label: '标准庭院房 (98元/天)' },
      { value: 'deluxe', label: '豪华庭院房 (128元/天)' },
      { value: 'vip', label: '贵宾房 (198元/天)' }
    ],
    minDate: '2023-01-01',
    maxDate: '2030-12-31',
    // 弹窗相关数据
    showTodayCheckinsModal: false,
    showNotCheckedInModal: false,
    showAvailableRoomsModal: false,
    showInStoreDogsModal: false,
    todayCheckinsList: [],         // 今日应入住列表
    notCheckedInList: [],          // 今日未入住列表
    availableRoomsList: [],        // 空闲房间列表
    inStoreDogsList: [],           // 在店狗狗列表
    // 空闲房间筛选条件
    availableRoomCheckInDate: '',
    availableRoomCheckInTime: '',
    availableRoomCheckOutDate: '',
    availableRoomCheckOutTime: '',
    availableRoomTypeIndex: 0,
    availableRoomResults: null,      // 空闲房间查询结果
    showAvailableRoomResults: false,
    isAdmin: false
  },

  onLoad() {
    // 检查用户是否已登录
    const app = getApp();
    if (!app.checkLogin()) {
      return;
    }

    // 检查用户权限
    const isAdmin = app.isAdmin();
    this.setData({ isAdmin });

    this.initDate();
    this.loadData();
  },

  initDate() {
    const today = new Date().toISOString().split('T')[0];
    this.setData({
      selectedDate: today
    }, () => {
      this.loadDailyView();
    });
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const manager = app.getManager();
    const stats = manager.getStats() || {};

    // 计算新统计项
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // 获取今日应入住（今天有入住预约的狗狗）
    const bookings = manager.getBookings() || [];
    const dogs = manager.getDogs() || [];

    const todayCheckins = bookings.filter(booking => {
      if (booking.status !== 'active') return false;
      const checkInDate = new Date(booking.checkInTime).toISOString().split('T')[0];
      return checkInDate === today;
    });

    // 今日未入住（超过预约入住时间但还未入住）
    const notCheckedIn = bookings.filter(booking => {
      if (booking.status !== 'active' || booking.checkedIn) return false;
      const checkInTime = new Date(booking.checkInTime);
      return checkInTime < now;
    });

    // 在店狗狗（当前在店的狗狗）
    const inStoreDogs = bookings.filter(booking => {
      if (booking.status !== 'active' || !booking.checkedIn) return false;
      const checkInTime = new Date(booking.checkInTime);
      const checkOutTime = new Date(booking.checkOutTime);
      return checkInTime <= now && checkOutTime > now;
    });

    // 今日空闲房间（今天可预定的房间）
    const rooms = manager.getRooms() || [];
    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter(room => room.status === 'occupied').length;
    const availableRoomsToday = totalRooms - occupiedRooms;

    // 更新stats对象
    stats.todayScheduledCheckins = todayCheckins.length;
    stats.todayNotCheckedIn = notCheckedIn.length;
    stats.inStoreDogs = inStoreDogs.length;
    stats.availableRoomsToday = availableRoomsToday;

    // 确保stats有基础字段
    stats.totalRooms = stats.totalRooms || totalRooms;
    stats.totalDogs = stats.totalDogs || dogs.length;
    stats.occupiedRooms = stats.occupiedRooms || occupiedRooms;
    stats.todayBookings = stats.todayBookings || todayCheckins.length;
    stats.availableRooms = stats.availableRooms || availableRoomsToday;

    // 获取今日提醒
    const reminders = this.getTodayReminders(manager);

    this.setData({
      stats,
      reminders
    });
  },

  getTodayReminders(manager) {
    const today = new Date().toISOString().split('T')[0];
    const dailyData = manager.getDailyView(today);
    const bookings = manager.getBookings();
    const dogs = manager.getDogs();
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 86400000);

    const reminders = [];

    if (dailyData.checkIns > 0) {
      reminders.push({
        title: '今日入住',
        content: `${dailyData.checkIns}只狗狗`,
        color: '#666',
        bgColor: '#f5f5f5'
      });
    }

    if (dailyData.checkOuts > 0) {
      reminders.push({
        title: '今日离店',
        content: `${dailyData.checkOuts}只狗狗`,
        color: '#888',
        bgColor: '#f0f0f0'
      });
    }

    if (dailyData.activeBookings > 0) {
      reminders.push({
        title: '在店狗狗',
        content: `${dailyData.activeBookings}只`,
        color: '#333',
        bgColor: '#f5f5f5'
      });
    }

    // 检查即将离店的狗狗
    const upcomingCheckouts = bookings.filter(booking => {
      if (booking.status !== 'active') return false;
      const checkoutTime = new Date(booking.checkOutTime);
      return checkoutTime > now && checkoutTime < next24Hours;
    });

    if (upcomingCheckouts.length > 0) {
      reminders.push({
        title: '未来24小时离店',
        content: `${upcomingCheckouts.length}只`,
        color: '#888',
        bgColor: '#f0f0f0'
      });
    }

    return reminders;
  },

  // 日期变更
  onDateChange(e) {
    this.setData({
      selectedDate: e.detail.value
    });
  },

  // 加载每日视图
  loadDailyView() {
    const { selectedDate } = this.data;

    if (!selectedDate) {
      app.showMessage('请选择日期', 'error');
      return;
    }

    const manager = app.getManager();
    const dailyData = manager.getDailyView(selectedDate);

    this.setData({ dailyData });
  },

  // 导航方法
  navigateToRooms(e) {
    wx.switchTab({
      url: '/pages/rooms/rooms'
    });
  },

  navigateToDogs(e) {
    wx.switchTab({
      url: '/pages/dogs/dogs'
    });
  },

  navigateToBooking() {
    wx.navigateTo({
      url: '/pages/booking/booking'
    });
  },


  navigateToHistory() {
    wx.navigateTo({
      url: '/pages/history/history'
    });
  },

  // 弹窗相关方法
  showTodayCheckinsModal() {
    const manager = app.getManager();
    const bookings = manager.getBookings();
    const dogs = manager.getDogs();
    const rooms = manager.getRooms();
    const today = new Date().toISOString().split('T')[0];

    const todayCheckinsList = bookings.filter(booking => {
      if (booking.status !== 'active') return false;
      const checkInDate = new Date(booking.checkInTime).toISOString().split('T')[0];
      return checkInDate === today;
    }).map(booking => {
      const dog = dogs.find(d => d.id === booking.dogId);
      const room = rooms.find(r => r.id === booking.roomId);
      return {
        id: booking.id,
        dogName: dog ? dog.name : '未知狗狗',
        roomNumber: room ? room.number : '未知房间',
        checkInTime: manager.formatDateTime(booking.checkInTime),
        checkOutTime: manager.formatDateTime(booking.checkOutTime),
        checkedIn: booking.checkedIn
      };
    });

    this.setData({
      showTodayCheckinsModal: true,
      todayCheckinsList
    });
  },

  showNotCheckedInModal() {
    const manager = app.getManager();
    const bookings = manager.getBookings();
    const dogs = manager.getDogs();
    const rooms = manager.getRooms();
    const now = new Date();

    const notCheckedInList = bookings.filter(booking => {
      if (booking.status !== 'active' || booking.checkedIn) return false;
      const checkInTime = new Date(booking.checkInTime);
      return checkInTime < now;
    }).map(booking => {
      const dog = dogs.find(d => d.id === booking.dogId);
      const room = rooms.find(r => r.id === booking.roomId);
      const checkInTime = new Date(booking.checkInTime);
      const delayHours = Math.floor((now - checkInTime) / (1000 * 60 * 60));

      return {
        id: booking.id,
        dogName: dog ? dog.name : '未知狗狗',
        roomNumber: room ? room.number : '未知房间',
        checkInTime: manager.formatDateTime(booking.checkInTime),
        checkOutTime: manager.formatDateTime(booking.checkOutTime),
        delayHours
      };
    });

    this.setData({
      showNotCheckedInModal: true,
      notCheckedInList
    });
  },

  showAvailableRoomsModal() {
    // 初始化日期为当前日期和明天
    const now = new Date();
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const tomorrow = new Date(now.getTime() + 86400000);

    this.setData({
      showAvailableRoomsModal: true,
      showAvailableRoomResults: false,
      availableRoomCheckInDate: formatDate(now),
      availableRoomCheckInTime: '', // 不再使用时间
      availableRoomCheckOutDate: formatDate(tomorrow),
      availableRoomCheckOutTime: '', // 不再使用时间
      availableRoomTypeIndex: 0
    });
  },

  showInStoreDogsModal() {
    const manager = app.getManager();
    const bookings = manager.getBookings();
    const dogs = manager.getDogs();
    const rooms = manager.getRooms();
    const now = new Date();

    const inStoreDogsList = bookings.filter(booking => {
      if (booking.status !== 'active' || !booking.checkedIn) return false;
      const checkInTime = new Date(booking.checkInTime);
      const checkOutTime = new Date(booking.checkOutTime);
      return checkInTime <= now && checkOutTime > now;
    }).map(booking => {
      const dog = dogs.find(d => d.id === booking.dogId);
      const room = rooms.find(r => r.id === booking.roomId);
      return {
        id: booking.id,
        dogName: dog ? dog.name : '未知狗狗',
        roomNumber: room ? room.number : '未知房间',
        checkInTime: manager.formatDateTime(booking.checkInTime),
        checkOutTime: manager.formatDateTime(booking.checkOutTime),
        owner: dog ? dog.owner : '未知',
        phone: dog ? dog.phone : '未知'
      };
    });

    this.setData({
      showInStoreDogsModal: true,
      inStoreDogsList
    });
  },

  closeAllModals() {
    this.setData({
      showTodayCheckinsModal: false,
      showNotCheckedInModal: false,
      showAvailableRoomsModal: false,
      showInStoreDogsModal: false,
      showAvailableRoomResults: false,
      availableRoomResults: null
    });
  },

  // 空闲房间查询相关方法
  onAvailableRoomCheckInDateChange(e) {
    this.setData({
      availableRoomCheckInDate: e.detail.value
    });
  },

  onAvailableRoomCheckInTimeChange(e) {
    this.setData({
      availableRoomCheckInTime: e.detail.value
    });
  },

  onAvailableRoomCheckOutDateChange(e) {
    this.setData({
      availableRoomCheckOutDate: e.detail.value
    });
  },

  onAvailableRoomCheckOutTimeChange(e) {
    this.setData({
      availableRoomCheckOutTime: e.detail.value
    });
  },

  onAvailableRoomTypeChange(e) {
    this.setData({
      availableRoomTypeIndex: e.detail.value
    });
  },

  queryAvailableRooms() {
    const { availableRoomCheckInDate, availableRoomCheckOutDate, availableRoomTypeIndex, roomTypeOptions } = this.data;

    if (!availableRoomCheckInDate || !availableRoomCheckOutDate) {
      app.showMessage('请选择完整的入住和离店日期', 'error');
      return;
    }

    if (new Date(availableRoomCheckInDate) >= new Date(availableRoomCheckOutDate)) {
      app.showMessage('离店日期必须晚于入住日期', 'error');
      return;
    }

    const manager = app.getManager();
    const roomType = roomTypeOptions[availableRoomTypeIndex].value;

    // 获取所有该类型的房间
    const rooms = manager.getRooms().filter(room => room.type === roomType);
    const bookings = manager.getBookings();

    // 计算日期范围：入住时间前3天到离店时间后3天
    const startDate = new Date(availableRoomCheckInDate);
    startDate.setDate(startDate.getDate() - 3);
    const endDate = new Date(availableRoomCheckOutDate);
    endDate.setDate(endDate.getDate() + 3);

    // 生成日期数组
    const dates = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dates.push(dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 生成房间号数组
    const roomNumbers = rooms.map(room => room.number);

    // 生成矩阵数据
    const matrixData = rooms.map(room => {
      return dates.map(date => {
        // 检查该房间在该日期是否有预定
        const bookingOnDate = bookings.find(booking => {
          if (booking.status !== 'active' || booking.roomId !== room.id) return false;

          const bookingStart = new Date(booking.checkInTime);
          const bookingEnd = new Date(booking.checkOutTime);
          const checkDate = new Date(date);
          const nextDate = new Date(checkDate.getTime() + 86400000); // 下一天

          // 检查日期是否在预约时间内（入住时间 <= 日期 < 离店时间）
          return bookingStart < nextDate && bookingEnd > checkDate;
        });

        if (bookingOnDate) {
          // 获取狗狗信息
          const dogs = manager.getDogs();
          const dog = dogs.find(d => d.id === bookingOnDate.dogId);
          return {
            isBooked: true,
            dogName: dog ? dog.name : '未知狗狗',
            date: date,
            roomId: room.id
          };
        } else {
          return {
            isBooked: false,
            dogName: '',
            date: date,
            roomId: room.id
          };
        }
      });
    });

    this.setData({
      showAvailableRoomResults: true,
      availableRoomResults: {
        roomNumbers,
        dates,
        matrix: matrixData,
        rooms: rooms // 保留房间原始信息
      }
    });
  },

  backToAvailableRoomQuery() {
    this.setData({
      showAvailableRoomResults: false,
      availableRoomResults: null
    });
  },

  bookRoomFromModal(e) {
    const roomId = e.currentTarget.dataset.id;
    // 跳转到预约页面
    wx.switchTab({
      url: '/pages/booking/booking',
      success: () => {
        // 可以通过全局数据传递房间ID，但预约页面需要更多信息
        // 暂时只关闭弹窗
        this.closeAllModals();
      }
    });
  },

  modifyBookingFromModal(e) {
    const bookingId = e.currentTarget.dataset.id;
    const app = getApp();
    app.globalData.bookingNavigationData = {
      type: 'modifyBooking',
      bookingId: parseInt(bookingId)
    };
    wx.switchTab({
      url: '/pages/booking/booking'
    });
  },

  confirmCheckIn(e) {
    const bookingId = e.currentTarget.dataset.id;
    const manager = app.getManager();
    const bookings = manager.getBookings();
    const booking = bookings.find(b => b.id === bookingId);

    if (booking) {
      const updatedBooking = {
        id: bookingId,
        checkedIn: true
      };
      const success = manager.updateBooking(updatedBooking);
      if (success) {
        app.showMessage('狗狗已确认到店！', 'success');
        // 刷新数据和关闭弹窗
        this.loadData();
        this.closeAllModals();
      } else {
        app.showMessage('操作失败', 'error');
      }
    }
  },

  cancelBooking(e) {
    const bookingId = e.currentTarget.dataset.id;
    const manager = app.getManager();

    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个预约吗？',
      success: (res) => {
        if (res.confirm) {
          const success = manager.cancelBooking(bookingId);
          if (success) {
            app.showMessage('预约已取消', 'success');
            this.loadData();
            this.closeAllModals();
          } else {
            app.showMessage('取消失败', 'error');
          }
        }
      }
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadData();
    wx.stopPullDownRefresh();
  },

  // 跳转到设置页面
  goToSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  },

  // 退出登录
  logout() {
    const app = getApp();
    // 清除用户信息
    app.globalData.userInfo = null;
    try {
      wx.removeStorageSync('userInfo');
    } catch (e) {
      console.error('清除用户信息失败:', e);
    }
    // 跳转到登录页面
    wx.reLaunch({
      url: '/pages/login/login'
    });
  }
});
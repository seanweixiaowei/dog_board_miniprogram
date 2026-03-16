// app.js
App({
  onLaunch() {
    // 初始化数据管理（保留本地存储作为备用）
    const manager = this.getManager();
    manager.initStorage();

    // 尝试从本地存储恢复用户登录状态
    try {
      const storedUserInfo = wx.getStorageSync('userInfo');
      const storedToken = wx.getStorageSync('token');

      if (storedUserInfo && storedToken) {
        // 恢复token和用户信息
        this.globalData.userInfo = storedUserInfo;
        this.globalData.token = storedToken;
        console.log('用户登录状态已恢复:', storedUserInfo.phoneNumber);

        // 可以在这里验证token是否仍然有效（可选）
        // 如果需要，可以调用/api/auth/me验证token
      } else if (storedUserInfo) {
        // 只有用户信息没有token，清空用户信息
        console.log('发现旧的用户信息但没有token，清除登录状态');
        wx.removeStorageSync('userInfo');
        this.globalData.userInfo = null;
      }
    } catch (e) {
      console.error('恢复用户登录状态失败:', e);
    }

    console.log('小程序初始化完成');
  },

  globalData: {
    userInfo: null,
    manager: null,
    bookingNavigationData: null,  // 用于在tab间传递预约导航数据
    apiBaseUrl: 'http://39.102.78.230:3000', // 后端API地址
    token: null // JWT token
  },

  // 获取数据管理器单例
  getManager() {
    if (!this.globalData.manager) {
      this.globalData.manager = new DogBoardManager(this);
    }
    return this.globalData.manager;
  },

  // 显示消息提示
  showMessage(title, type = 'success', duration = 3000) {
    const iconMap = {
      success: 'success',
      error: 'error',
      info: 'none'
    };

    wx.showToast({
      title,
      icon: iconMap[type] || 'none',
      duration
    });
  },

  // API请求方法
  apiRequest(method, endpoint, data = null, requireAuth = true) {
    return new Promise((resolve, reject) => {
      const url = `${this.globalData.apiBaseUrl}${endpoint}`;
      const header = {
        'Content-Type': 'application/json'
      };

      // 如果需要认证，添加Authorization头
      if (requireAuth && this.globalData.token) {
        header['Authorization'] = `Bearer ${this.globalData.token}`;
      }

      wx.request({
        url,
        method,
        data,
        header,
        success: (res) => {
          const { statusCode, data: responseData } = res;

          if (statusCode >= 200 && statusCode < 300) {
            // 检查后端API返回格式
            if (responseData.success === false) {
              // 后端返回的业务错误
              reject({
                error: responseData.error || '请求失败',
                code: responseData.code || 'UNKNOWN_ERROR',
                message: responseData.message || '请求失败'
              });
            } else {
              // 请求成功
              resolve(responseData.data || responseData);
            }
          } else {
            // HTTP状态码错误
            reject({
              error: responseData.error || `HTTP ${statusCode}`,
              code: responseData.code || 'HTTP_ERROR',
              message: responseData.message || '请求失败'
            });
          }
        },
        fail: (err) => {
          reject({
            error: '网络请求失败',
            code: 'NETWORK_ERROR',
            message: err.errMsg || '请检查网络连接'
          });
        }
      });
    });
  },

  // 检查用户是否已登录，未登录则跳转到登录页面
  checkLogin() {
    const userInfo = this.globalData.userInfo;
    if (!userInfo || !userInfo.phoneNumber) {
      // 尝试从本地存储恢复用户信息
      try {
        const storedUserInfo = wx.getStorageSync('userInfo');
        if (storedUserInfo && storedUserInfo.phoneNumber) {
          this.globalData.userInfo = storedUserInfo;
          return true;
        }
      } catch (e) {
        console.error('读取用户信息失败:', e);
      }

      // 未登录，跳转到登录页面
      wx.reLaunch({
        url: '/pages/login/login'
      });
      return false;
    }
    return true;
  },

  // 检查用户是否是管理员
  isAdmin() {
    const userInfo = this.globalData.userInfo;
    // 后端角色：super_admin, manager 有管理员权限
    return userInfo && (userInfo.role === 'super_admin' || userInfo.role === 'manager');
  },

  // 检查权限（基于后端权限字段）
  checkPermission(permissionName) {
    const userInfo = this.globalData.userInfo;
    if (!userInfo || !userInfo.permissions) {
      return false;
    }

    // 管理员有所有权限
    if (this.isAdmin()) {
      return true;
    }

    // 检查具体权限字段
    return userInfo.permissions[permissionName] === true;
  },
});

// 数据管理类
class DogBoardManager {
  constructor(appInstance) {
    this.app = appInstance;
    this.storage = wx.getStorageSync ? wx.getStorageSync : null;
  }

  // API请求辅助方法
  apiRequest(method, endpoint, data = null, requireAuth = true) {
    return this.app.apiRequest(method, endpoint, data, requireAuth);
  }

  initStorage() {
    // 初始化房间数据（如果不存在）
    try {
      let rooms = wx.getStorageSync('rooms');
      if (!rooms) {
        const defaultRooms = this.createDefaultRooms();
        wx.setStorageSync('rooms', defaultRooms);
      }

      // 初始化其他数据
      let dogs = wx.getStorageSync('dogs');
      if (!dogs) {
        wx.setStorageSync('dogs', []);
      }

      let bookings = wx.getStorageSync('bookings');
      if (!bookings) {
        wx.setStorageSync('bookings', []);
      }

      let nextId = wx.getStorageSync('nextId');
      if (!nextId) {
        wx.setStorageSync('nextId', {
          room: 100,
          dog: 1000,
          booking: 10000
        });
      }
    } catch (e) {
      console.error('初始化存储失败:', e);
    }
  }

  createDefaultRooms() {
    const rooms = [];
    let id = 1;

    // 标准庭院房 28间
    for (let i = 1; i <= 28; i++) {
      rooms.push({
        id: id++,
        number: `S${i.toString().padStart(2, '0')}`,
        type: 'standard',
        price: 98,
        notes: '标准庭院房',
        status: 'available'
      });
    }

    // 豪华庭院房 24间
    for (let i = 1; i <= 24; i++) {
      rooms.push({
        id: id++,
        number: `D${i.toString().padStart(2, '0')}`,
        type: 'deluxe',
        price: 128,
        notes: '豪华庭院房',
        status: 'available'
      });
    }

    // 贵宾房 8间
    for (let i = 1; i <= 8; i++) {
      rooms.push({
        id: id++,
        number: `V${i.toString().padStart(2, '0')}`,
        type: 'vip',
        price: 198,
        notes: '贵宾房',
        status: 'available'
      });
    }

    return rooms;
  }

  // 房间管理
  getRooms() {
    try {
      const rooms = wx.getStorageSync('rooms') || [];
      const dogs = this.getDogs();
      const bookings = this.getBookings();
      const now = new Date().getTime();

      // 为每个房间添加当前狗狗信息
      return rooms.map(room => {
        const roomCopy = {...room};

        // 查找当前有效的预订
        const activeBooking = bookings.find(booking =>
          booking.roomId === room.id &&
          booking.status === 'active' &&
          new Date(booking.checkInTime).getTime() <= now &&
          new Date(booking.checkOutTime).getTime() > now
        );

        if (activeBooking) {
          // 获取预约中的所有狗狗ID（支持多只狗狗）
          const dogIds = activeBooking.dogIds && activeBooking.dogIds.length > 0 ? activeBooking.dogIds : (activeBooking.dogId ? [activeBooking.dogId] : []);

          // 获取所有狗狗的完整信息
          const roomDogs = dogs.filter(d => dogIds.includes(d.id)).map(dog => {
            const dogCopy = {...dog};
            // 为狗狗添加状态字段（在店/离店）
            const dogActiveBooking = bookings.find(b => {
              // 检查预约中是否包含这只狗狗
              const hasDog = (b.dogIds && b.dogIds.includes(dog.id)) || b.dogId === dog.id;
              return hasDog &&
                b.status === 'active' &&
                new Date(b.checkInTime).getTime() <= now &&
                new Date(b.checkOutTime).getTime() > now;
            });
            dogCopy.status = dogActiveBooking ? '在店' : '离店';
            return dogCopy;
          });

          // 设置房间的狗狗信息
          roomCopy.currentDogs = roomDogs; // 所有狗狗数组
          roomCopy.currentDog = roomDogs.length > 0 ? roomDogs[0] : null; // 第一只狗狗（向后兼容）
          roomCopy.dogCount = roomDogs.length; // 狗狗数量
          roomCopy.currentBooking = activeBooking;
          roomCopy.displayStatus = 'occupied';
          roomCopy.status = 'occupied'; // 兼容性字段
        } else {
          roomCopy.currentDogs = [];
          roomCopy.currentDog = null;
          roomCopy.dogCount = 0;
          roomCopy.currentBooking = null;
          roomCopy.displayStatus = 'available';
          roomCopy.status = 'available'; // 兼容性字段
        }

        return roomCopy;
      });
    } catch (e) {
      console.error('获取房间数据失败:', e);
      return [];
    }
  }

  saveRooms(rooms) {
    try {
      wx.setStorageSync('rooms', rooms);
      return true;
    } catch (e) {
      console.error('保存房间数据失败:', e);
      return false;
    }
  }

  addRoom(room) {
    const rooms = this.getRooms();
    const nextId = wx.getStorageSync('nextId');
    room.id = nextId.room++;
    rooms.push(room);
    const success = this.saveRooms(rooms);
    if (success) {
      wx.setStorageSync('nextId', nextId);
    }
    return success ? room.id : null;
  }

  updateRoom(updatedRoom) {
    const rooms = this.getRooms();
    const index = rooms.findIndex(r => r.id === updatedRoom.id);
    if (index !== -1) {
      rooms[index] = updatedRoom;
      return this.saveRooms(rooms);
    }
    return false;
  }

  deleteRoom(roomId) {
    const rooms = this.getRooms();
    const filteredRooms = rooms.filter(r => r.id !== roomId);
    const success = this.saveRooms(filteredRooms);
    return success && filteredRooms.length !== rooms.length;
  }

  // 狗狗管理
  getDogs() {
    try {
      return wx.getStorageSync('dogs') || [];
    } catch (e) {
      console.error('获取狗狗数据失败:', e);
      return [];
    }
  }

  saveDogs(dogs) {
    try {
      wx.setStorageSync('dogs', dogs);
      return true;
    } catch (e) {
      console.error('保存狗狗数据失败:', e);
      return false;
    }
  }

  addDog(dog) {
    const dogs = this.getDogs();
    const nextId = wx.getStorageSync('nextId');
    dog.id = nextId.dog++;
    dog.createdAt = new Date().toISOString();
    dogs.push(dog);
    const success = this.saveDogs(dogs);
    if (success) {
      wx.setStorageSync('nextId', nextId);
    }
    return success ? dog.id : null;
  }

  updateDog(updatedDog) {
    const dogs = this.getDogs();
    const index = dogs.findIndex(d => d.id === updatedDog.id);
    if (index !== -1) {
      dogs[index] = updatedDog;
      return this.saveDogs(dogs);
    }
    return false;
  }

  deleteDog(dogId) {
    const dogs = this.getDogs();
    const filteredDogs = dogs.filter(d => d.id !== dogId);
    const success = this.saveDogs(filteredDogs);
    return success && filteredDogs.length !== dogs.length;
  }

  // 预约管理
  getBookings() {
    try {
      return wx.getStorageSync('bookings') || [];
    } catch (e) {
      console.error('获取预约数据失败:', e);
      return [];
    }
  }

  saveBookings(bookings) {
    try {
      wx.setStorageSync('bookings', bookings);
      return true;
    } catch (e) {
      console.error('保存预约数据失败:', e);
      return false;
    }
  }

  addBooking(booking) {
    const bookings = this.getBookings();
    const nextId = wx.getStorageSync('nextId');
    booking.id = nextId.booking++;
    booking.createdAt = new Date().toISOString();
    booking.status = 'active';
    booking.checkedIn = false;

    // 确保dogIds字段存在（向后兼容）
    if (!booking.dogIds) {
      // 如果只有dogId，转换为dogIds数组
      booking.dogIds = booking.dogId ? [booking.dogId] : [];
    }

    bookings.push(booking);
    const success = this.saveBookings(bookings);

    if (success) {
      // 更新房间状态
      this.updateRoomStatus(booking.roomId, 'occupied');
      wx.setStorageSync('nextId', nextId);
    }
    return success ? booking.id : null;
  }

  updateBooking(updatedBooking) {
    const bookings = this.getBookings();
    const index = bookings.findIndex(b => b.id === updatedBooking.id);
    if (index !== -1) {
      // 合并更新，保留原有字段
      bookings[index] = {
        ...bookings[index],
        ...updatedBooking
      };
      return this.saveBookings(bookings);
    }
    return false;
  }

  cancelBooking(bookingId) {
    const bookings = this.getBookings();
    const booking = bookings.find(b => b.id === bookingId);
    if (booking) {
      booking.status = 'cancelled';
      const success = this.saveBookings(bookings);

      if (success) {
        // 更新房间状态
        this.updateRoomStatus(booking.roomId, 'available');
      }
      return success;
    }
    return false;
  }

  updateRoomStatus(roomId, status) {
    const rooms = this.getRooms();
    const room = rooms.find(r => r.id === roomId);
    if (room) {
      room.status = status;
      this.saveRooms(rooms);
    }
  }

  // 检查房间是否可用
  isRoomAvailable(roomId, checkInTime, checkOutTime) {
    const bookings = this.getBookings();
    const checkIn = new Date(checkInTime).getTime();
    const checkOut = new Date(checkOutTime).getTime();

    return !bookings.some(booking => {
      if (booking.status !== 'active') return false;
      if (booking.roomId !== roomId) return false;

      const bookingStart = new Date(booking.checkInTime).getTime();
      const bookingEnd = new Date(booking.checkOutTime).getTime();

      // 检查时间是否重叠
      return (checkIn < bookingEnd && checkOut > bookingStart);
    });
  }

  // 获取可用房间
  getAvailableRooms(roomType, checkInTime, checkOutTime) {
    const rooms = this.getRooms();
    return rooms.filter(room => {
      if (room.type !== roomType) return false;
      return this.isRoomAvailable(room.id, checkInTime, checkOutTime);
    });
  }

  // 统计方法
  getStats() {
    const rooms = this.getRooms();
    const dogs = this.getDogs();
    const bookings = this.getBookings();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayBookings = bookings.filter(booking => {
      if (booking.status !== 'active') return false;
      const checkIn = new Date(booking.checkInTime);
      return checkIn >= today && checkIn < new Date(today.getTime() + 86400000);
    });

    const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;

    return {
      totalRooms: rooms.length,
      totalDogs: dogs.length,
      occupiedRooms,
      todayBookings: todayBookings.length,
      availableRooms: rooms.length - occupiedRooms
    };
  }

  // 搜索方法
  searchDogs(query) {
    const dogs = this.getDogs();
    if (!query) return dogs;

    const lowerQuery = query.toLowerCase();
    return dogs.filter(dog =>
      dog.name.toLowerCase().includes(lowerQuery) ||
      dog.owner.toLowerCase().includes(lowerQuery) ||
      dog.phone.includes(query)
    );
  }

  searchHistory(query, type) {
    const dogs = this.getDogs();
    const rooms = this.getRooms();
    const bookings = this.getBookings();

    let results = [];

    bookings.forEach(booking => {
      // 获取预约中的第一只狗狗（支持多只狗狗）
      const dogId = booking.dogIds && booking.dogIds.length > 0 ? booking.dogIds[0] : booking.dogId;
      const dog = dogs.find(d => d.id === dogId);
      const room = rooms.find(r => r.id === booking.roomId);

      if (dog && room) {
        const match = !query ||
          dog.name.toLowerCase().includes(query.toLowerCase()) ||
          dog.owner.toLowerCase().includes(query.toLowerCase()) ||
          dog.phone.includes(query) ||
          room.number.toLowerCase().includes(query.toLowerCase());

        if (match) {
          if (type === 'all' ||
            (type === 'dog' && dog) ||
            (type === 'room' && room)) {
            results.push({
              type: 'booking',
              booking,
              dog,
              room,
              timestamp: booking.createdAt
            });
          }
        }
      }
    });

    // 按时间排序
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return results;
  }

  // 获取每日视图数据
  getDailyView(date) {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86400000);

    const rooms = this.getRooms();
    const dogs = this.getDogs();
    const bookings = this.getBookings();

    const dailyRooms = rooms.map(room => {
      const roomBookings = bookings.filter(booking =>
        booking.roomId === room.id &&
        booking.status === 'active'
      );

      const todayBooking = roomBookings.find(booking => {
        const checkIn = new Date(booking.checkInTime);
        const checkOut = new Date(booking.checkOutTime);
        return checkIn < endOfDay && checkOut > startOfDay;
      });

      const roomCopy = {...room};
      if (todayBooking) {
        // 获取预约中的所有狗狗ID（支持多只狗狗）
        const dogIds = todayBooking.dogIds && todayBooking.dogIds.length > 0 ? todayBooking.dogIds : (todayBooking.dogId ? [todayBooking.dogId] : []);

        // 获取所有狗狗的完整信息
        const roomDogs = dogs.filter(d => dogIds.includes(d.id));

        // 设置房间的狗狗信息
        roomCopy.currentDogs = roomDogs; // 所有狗狗数组
        roomCopy.currentDog = roomDogs.length > 0 ? roomDogs[0] : null; // 第一只狗狗（向后兼容）
        roomCopy.dogCount = roomDogs.length; // 狗狗数量
        roomCopy.currentBooking = todayBooking;
        roomCopy.displayStatus = 'occupied';
        roomCopy.status = 'occupied'; // 兼容性字段
      } else {
        roomCopy.currentDogs = [];
        roomCopy.currentDog = null;
        roomCopy.dogCount = 0;
        roomCopy.currentBooking = null;
        roomCopy.displayStatus = 'available';
        roomCopy.status = 'available'; // 兼容性字段
      }

      return roomCopy;
    });

    const activeBookings = bookings.filter(booking => {
      if (booking.status !== 'active') return false;
      const checkIn = new Date(booking.checkInTime);
      const checkOut = new Date(booking.checkOutTime);
      return checkIn < endOfDay && checkOut > startOfDay;
    });

    return {
      date: date,
      rooms: dailyRooms,
      activeBookings: activeBookings.length,
      checkIns: activeBookings.filter(b => {
        const checkIn = new Date(b.checkInTime);
        return checkIn >= startOfDay && checkIn < endOfDay;
      }).length,
      checkOuts: activeBookings.filter(b => {
        const checkOut = new Date(b.checkOutTime);
        return checkOut >= startOfDay && checkOut < endOfDay;
      }).length
    };
  }

  // 获取房间类型名称
  getRoomTypeName(type) {
    const typeNames = {
      'standard': '标准庭院房',
      'deluxe': '豪华庭院房',
      'vip': '贵宾房'
    };
    return typeNames[type] || type;
  }

  // 格式化日期时间
  formatDateTime(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // 格式化日期时间本地
  formatDateTimeLocal(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}
// pages/booking/booking.js
const app = getApp();

Page({
  data: {
    // 表单数据
    selectedDogIndex: -1,
    selectedRoomTypeIndex: 0,
    checkInDate: '',
    checkInTime: '',
    checkOutDate: '',
    checkOutTime: '',
    selectedRoomId: null,
    minDate: '2023-01-01',
    maxDate: '2030-12-31',
    minTime: '00:00',
    maxTime: '23:59',

    // 选项数据
    dogOptions: [],
    roomTypeOptions: [
      { value: 'standard', label: '标准庭院房 (98元/天)' },
      { value: 'deluxe', label: '豪华庭院房 (128元/天)' },
      { value: 'vip', label: '贵宾房 (198元/天)' }
    ],
    roomTypeNames: {
      'standard': '标准庭院房',
      'deluxe': '豪华庭院房',
      'vip': '贵宾房'
    },

    // 可用房间
    availableRooms: [],

    // 当前预约
    activeBookings: [],

    // 计算属性
    canCreateBooking: false,
    canFindAvailableRooms: false,
    showAvailableRoomsResult: false,

    // 编辑模式
    editingBookingId: null,
    isEditingBooking: false,

    // 狗狗搜索
    showDogSearchModal: false,
    dogSearchQuery: '',
    dogSearchResults: [],

    // 已选择的多个狗狗
    selectedDogs: [],

    // 权限控制
    isAdmin: false
  },

  onLoad(options) {
    const app = getApp();
    // 检查用户是否已登录
    if (!app.checkLogin()) {
      return;
    }

    // 检查用户权限
    const isAdmin = app.isAdmin();
    this.setData({ isAdmin });

    // 检查是否有全局导航数据
    if (app.globalData.bookingNavigationData) {
      const navData = app.globalData.bookingNavigationData;
      console.log('onLoad收到导航数据:', navData);

      // 根据导航类型构建options
      if (navData.type === 'bookDog') {
        options.dogId = navData.dogId;
      } else if (navData.type === 'modifyBooking') {
        options.bookingId = navData.bookingId;
      }

      // 清除导航数据，避免重复使用
      app.globalData.bookingNavigationData = null;
    }

    this.initForm(options);
    this.loadActiveBookings();
  },

  onShow() {
    const app = getApp();
    // 检查是否有全局导航数据
    if (app.globalData.bookingNavigationData) {
      const navData = app.globalData.bookingNavigationData;
      console.log('收到导航数据:', navData);

      // 根据导航类型构建options
      const options = {};
      if (navData.type === 'bookDog') {
        options.dogId = navData.dogId;
      } else if (navData.type === 'modifyBooking') {
        options.bookingId = navData.bookingId;
      }

      // 清除导航数据，避免重复使用
      app.globalData.bookingNavigationData = null;

      // 初始化表单
      this.initForm(options);
    } else {
      // 正常加载
      this.loadDogOptions();
    }

    this.loadActiveBookings();
  },

  onPullDownRefresh() {
    this.loadActiveBookings();
    this.updateAvailableRooms();
    wx.stopPullDownRefresh();
  },

  initForm(options = {}) {
    const now = new Date();
    // 格式化为 YYYY-MM-DD（日期）
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // 格式化为 HH:mm（时间）
    const formatTime = (date) => {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const todayDate = formatDate(now);
    const todayTime = formatTime(now);
    const tomorrow = new Date(now.getTime() + 86400000);
    const tomorrowDate = formatDate(tomorrow);
    const tomorrowTime = formatTime(tomorrow);

    this.setData({
      checkInDate: todayDate,
      checkInTime: todayTime,
      checkOutDate: tomorrowDate,
      checkOutTime: tomorrowTime,
      selectedRoomTypeIndex: 0,
      selectedDogIndex: -1,
      selectedRoomId: null,
      showAvailableRoomsResult: false,
      editingBookingId: options.bookingId || null,
      isEditingBooking: !!options.bookingId,
      selectedDogs: []  // 清空已选择的狗狗列表
    });

    // 如果有预约ID，加载预约数据
    if (options.bookingId) {
      this.loadBookingData(options.bookingId);
    } else {
      this.loadDogOptions(options.dogId);
      this.updateAvailableRooms();
    }

  },

  // 加载预约数据
  loadBookingData(bookingId) {
    const app = getApp();
    const manager = app.getManager();
    const bookings = manager.getBookings();
    const booking = bookings.find(b => b.id === parseInt(bookingId));

    if (!booking) {
      app.showMessage('预约数据不存在', 'error');
      return;
    }

    // 获取狗狗信息（支持多只狗狗）
    const dogs = manager.getDogs();
    const dogIds = booking.dogIds || (booking.dogId ? [booking.dogId] : []);
    const selectedDogs = dogs
      .filter(d => dogIds.includes(d.id))
      .map(dog => ({
        id: dog.id,
        name: dog.name,
        owner: dog.owner,
        phone: dog.phone,
        breed: dog.breed
      }));

    // 加载狗狗选项并选择（传递第一只狗狗ID用于兼容）
    const firstDogId = dogIds.length > 0 ? dogIds[0] : null;
    this.loadDogOptions(firstDogId);

    // 设置入住和离店时间，分开为日期和时间
    const formatDate = (isoString) => {
      const date = new Date(isoString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const formatTime = (isoString) => {
      const date = new Date(isoString);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const checkInDate = formatDate(booking.checkInTime);
    const checkInTime = formatTime(booking.checkInTime);
    const checkOutDate = formatDate(booking.checkOutTime);
    const checkOutTime = formatTime(booking.checkOutTime);

    // 获取房间信息
    const rooms = manager.getRooms();
    const room = rooms.find(r => r.id === booking.roomId);
    let selectedRoomTypeIndex = 0;
    if (room) {
      // 找到房间类型对应的索引
      selectedRoomTypeIndex = this.data.roomTypeOptions.findIndex(option => option.value === room.type);
      if (selectedRoomTypeIndex < 0) selectedRoomTypeIndex = 0;
    }

    this.setData({
      checkInDate,
      checkInTime,
      checkOutDate,
      checkOutTime,
      selectedRoomTypeIndex,
      selectedRoomId: booking.roomId,
      showAvailableRoomsResult: false,
      selectedDogs
    }, () => {
      // 更新可用房间列表
      this.updateAvailableRooms();

      // 滚动到页面顶部
      setTimeout(() => {
        wx.pageScrollTo({
          scrollTop: 0,
          duration: 500
        });
      }, 500);
    });
  },

  loadDogOptions(dogId) {
    const app = getApp();
    const manager = app.getManager();
    const dogs = manager.getDogs();

    let dogOptions = dogs.map(dog => ({
      value: dog.id,
      label: `${dog.name} (${dog.owner}, ${dog.phone})`
    }));

    // 如果不是编辑预约模式，添加"添加狗狗"选项
    if (!this.data.isEditingBooking) {
      dogOptions.push({
        value: -1, // 特殊值表示添加新狗狗
        label: '＋ 添加狗狗'
      });
    }

    let selectedDogIndex = -1;
    let selectedDogs = [];

    if (dogId) {
      const dogIdNum = parseInt(dogId);
      selectedDogIndex = dogOptions.findIndex(option => option.value === dogIdNum);

      // 将狗狗添加到selectedDogs
      const dog = dogs.find(d => d.id === dogIdNum);
      if (dog) {
        selectedDogs = [{
          id: dog.id,
          name: dog.name,
          owner: dog.owner,
          phone: dog.phone,
          breed: dog.breed
        }];
      }
    }

    this.setData({
      dogOptions,
      selectedDogIndex: selectedDogIndex >= 0 ? selectedDogIndex : -1,
      selectedDogs
    }, () => {
      // 选择狗狗后更新可用房间
      if (selectedDogIndex >= 0) {
        this.updateAvailableRooms();
        this.updateCanCreateBooking();
      }
    });
  },

  // 狗狗选择变更
  onDogChange(e) {
    const index = e.detail.value;
    const { dogOptions, selectedDogs } = this.data;
    const selectedOption = dogOptions[index];

    // 检查是否选择了"添加狗狗"选项（value为-1）
    if (selectedOption && selectedOption.value === -1) {
      // 跳转到添加狗狗页面
      wx.navigateTo({
        url: '/pages/dogs/dogs?autoAdd=1',
        success: () => {
          // 重置选择状态
          this.setData({
            selectedDogIndex: -1
          });
        }
      });
      return;
    }

    // 获取狗狗详细信息
    const app = getApp();
    const manager = app.getManager();
    const dogs = manager.getDogs();
    const selectedDog = dogs.find(dog => dog.id === selectedOption.value);

    if (selectedDog) {
      // 检查是否已经选择了这只狗狗
      const alreadySelected = selectedDogs.some(dog => dog.id === selectedDog.id);
      if (!alreadySelected) {
        // 添加到已选择列表
        const newSelectedDog = {
          id: selectedDog.id,
          name: selectedDog.name,
          owner: selectedDog.owner,
          phone: selectedDog.phone,
          breed: selectedDog.breed
        };

        this.setData({
          selectedDogs: [...selectedDogs, newSelectedDog],
          selectedDogIndex: -1  // 重置选择器
        });

        // 更新可用房间和创建预约状态
        this.updateAvailableRooms();
        this.updateCanCreateBooking();
      } else {
        app.showMessage('这只狗狗已经添加过了', 'info');
        // 重置选择器
        this.setData({
          selectedDogIndex: -1
        });
      }
    }
  },

  // 房间类型变更
  onRoomTypeChange(e) {
    const index = e.detail.value;
    this.setData({
      selectedRoomTypeIndex: index,
      showAvailableRoomsResult: false
    });
    this.updateAvailableRooms();
    this.updateCanFindAvailableRooms();
  },

  // 入住时间变更
  onCheckInDateTimeChange(e) {
    this.setData({
      checkInDateTime: e.detail.value
    });
    this.updateAvailableRooms();
  },

  // 离店时间变更
  onCheckOutDateTimeChange(e) {
    this.setData({
      checkOutDateTime: e.detail.value
    });
    this.updateAvailableRooms();
  },

  // 入住日期变更
  onCheckInDateChange(e) {
    this.setData({
      checkInDate: e.detail.value,
      showAvailableRoomsResult: false
    });
    this.updateAvailableRooms();
    this.updateCanFindAvailableRooms();
  },

  // 入住时间变更
  onCheckInTimeChange(e) {
    this.setData({
      checkInTime: e.detail.value,
      showAvailableRoomsResult: false
    });
    this.updateAvailableRooms();
    this.updateCanFindAvailableRooms();
  },

  // 离店日期变更
  onCheckOutDateChange(e) {
    this.setData({
      checkOutDate: e.detail.value,
      showAvailableRoomsResult: false
    });
    this.updateAvailableRooms();
    this.updateCanFindAvailableRooms();
  },

  // 离店时间变更
  onCheckOutTimeChange(e) {
    this.setData({
      checkOutTime: e.detail.value,
      showAvailableRoomsResult: false
    });
    this.updateAvailableRooms();
    this.updateCanFindAvailableRooms();
  },

  // 更新可用房间
  updateAvailableRooms() {
    const app = getApp();
    const { selectedRoomTypeIndex, checkInDate, checkInTime, checkOutDate, checkOutTime } = this.data;

    // 检查日期和时间是否都已选择
    if (!checkInDate || !checkInTime || !checkOutDate || !checkOutTime) {
      this.setData({ availableRooms: [] });
      this.updateCanFindAvailableRooms();
      return;
    }

    // 组合日期和时间，格式为 "YYYY-MM-DDTHH:mm"
    const combineDateTime = (dateStr, timeStr) => {
      return `${dateStr}T${timeStr}`;
    };

    const checkInDateTime = combineDateTime(checkInDate, checkInTime);
    const checkOutDateTime = combineDateTime(checkOutDate, checkOutTime);

    if (new Date(checkInDateTime) >= new Date(checkOutDateTime)) {
      this.setData({ availableRooms: [] });
      this.updateCanFindAvailableRooms();
      return;
    }

    const manager = app.getManager();
    const roomType = this.data.roomTypeOptions[selectedRoomTypeIndex].value;
    const availableRooms = manager.getAvailableRooms(roomType, checkInDateTime, checkOutDateTime);

    this.setData({ availableRooms });
    this.updateCanCreateBooking();
    this.updateCanFindAvailableRooms();
  },

  // 选择房间
  selectRoom(e) {
    const roomId = e.currentTarget.dataset.id;
    this.setData({
      selectedRoomId: roomId
    });
    this.updateCanCreateBooking();
  },

  // 更新是否可以创建预约
  updateCanCreateBooking() {
    const { selectedDogs, selectedRoomId, checkInDate, checkInTime, checkOutDate, checkOutTime } = this.data;

    // 组合日期和时间，格式为 "YYYY-MM-DDTHH:mm"
    const combineDateTime = (dateStr, timeStr) => {
      return dateStr && timeStr ? `${dateStr}T${timeStr}` : '';
    };

    const checkInDateTime = combineDateTime(checkInDate, checkInTime);
    const checkOutDateTime = combineDateTime(checkOutDate, checkOutTime);

    const canCreate = selectedDogs.length > 0 &&
                      selectedRoomId &&
                      checkInDate &&
                      checkInTime &&
                      checkOutDate &&
                      checkOutTime &&
                      new Date(checkInDateTime) < new Date(checkOutDateTime);

    this.setData({ canCreateBooking: canCreate });
  },

  // 创建或更新预约
  createBooking() {
    const app = getApp();
    const { selectedDogs, selectedRoomId, checkInDate, checkInTime, checkOutDate, checkOutTime, isEditingBooking, editingBookingId } = this.data;

    if (selectedDogs.length === 0) {
      app.showMessage('请选择至少一只狗狗', 'error');
      return;
    }

    if (!selectedRoomId) {
      app.showMessage('请选择房间', 'error');
      return;
    }

    if (!checkInDate || !checkInTime || !checkOutDate || !checkOutTime) {
      app.showMessage('请选择完整的入住和离店时间', 'error');
      return;
    }

    // 组合日期和时间，格式为 "YYYY-MM-DDTHH:mm"
    const combineDateTime = (dateStr, timeStr) => {
      return `${dateStr}T${timeStr}`;
    };

    const checkInDateTime = combineDateTime(checkInDate, checkInTime);
    const checkOutDateTime = combineDateTime(checkOutDate, checkOutTime);

    if (new Date(checkInDateTime) >= new Date(checkOutDateTime)) {
      app.showMessage('离店时间必须晚于入住时间', 'error');
      return;
    }

    const manager = app.getManager();

    if (isEditingBooking && editingBookingId) {
      // 编辑模式：只更新单个预约
      // 再次检查房间是否可用（编辑模式下需要排除当前预约）
      if (!manager.isRoomAvailable(selectedRoomId, checkInDateTime, checkOutDateTime)) {
        app.showMessage('该房间在选定时间段已被占用，请重新选择', 'error');
        this.updateAvailableRooms();
        return;
      }

      // 编辑模式下，处理狗狗ID
      const dogIds = selectedDogs.map(dog => dog.id);
      if (dogIds.length === 0) {
        app.showMessage('请选择狗狗', 'error');
        return;
      }

      const bookingData = {
        id: parseInt(editingBookingId),
        dogIds: dogIds,
        roomId: selectedRoomId,
        checkInTime: checkInDateTime,
        checkOutTime: checkOutDateTime
      };

      const success = manager.updateBooking(bookingData);
      const message = success ? '预约更新成功！' : '更新失败，请重试';

      if (success) {
        app.showMessage(message, 'success');
        this.clearForm();
        this.loadActiveBookings();
        this.updateAvailableRooms();
      } else {
        app.showMessage(message, 'error');
      }
    } else {
      // 新建模式：为所有狗狗创建一个预约
      // 检查房间是否可用
      if (manager.isRoomAvailable(selectedRoomId, checkInDateTime, checkOutDateTime)) {
        // 获取所有狗狗ID
        const dogIds = selectedDogs.map(dog => dog.id);

        const bookingData = {
          dogIds: dogIds,
          roomId: selectedRoomId,
          checkInTime: checkInDateTime,
          checkOutTime: checkOutDateTime
        };

        const bookingId = manager.addBooking(bookingData);
        if (bookingId) {
          app.showMessage(`成功为 ${selectedDogs.length} 只狗狗创建预约！`, 'success');
          this.clearForm();
          this.loadActiveBookings();
          this.updateAvailableRooms();
        } else {
          app.showMessage('预约创建失败', 'error');
        }
      } else {
        // 房间已被占用
        app.showMessage('该房间在选定时间段已被占用，请重新选择', 'error');
        this.updateAvailableRooms();
      }
    }
  },

  // 清空表单
  clearForm() {
    this.initForm();
  },

  // 加载当前预约
  loadActiveBookings() {
    const app = getApp();
    const manager = app.getManager();
    const bookings = manager.getBookings();
    const dogs = manager.getDogs();
    const rooms = manager.getRooms();
    const now = new Date();

    const activeBookings = bookings
      .filter(booking => booking.status === 'active')
      .map(booking => {
        // 获取预约中的第一只狗狗（兼容旧数据）
        const dogId = booking.dogIds && booking.dogIds.length > 0 ? booking.dogIds[0] : booking.dogId;
        const dog = dogs.find(d => d.id === dogId);
        const room = rooms.find(r => r.id === booking.roomId);
        const checkIn = new Date(booking.checkInTime);
        const checkOut = new Date(booking.checkOutTime);

        // 计算状态
        let status;
        if (booking.checkedIn) {
          status = '在店';
        } else if (now >= checkIn) {
          status = '未到店';
        } else {
          status = '即将入住';
        }

        // 获取所有狗狗信息
        const dogIds = booking.dogIds || (booking.dogId ? [booking.dogId] : []);
        const bookingDogs = dogs.filter(d => dogIds.includes(d.id));
        const dogCount = dogIds.length;

        // 构建狗狗名称显示
        let dogNameDisplay = '未知狗狗';
        if (bookingDogs.length > 0) {
          if (dogCount === 1) {
            dogNameDisplay = bookingDogs[0].name;
          } else {
            dogNameDisplay = `${bookingDogs[0].name} 等 ${dogCount} 只狗狗`;
          }
        }

        return {
          id: booking.id,
          dogIds: dogIds,
          roomId: booking.roomId,
          dogName: dogNameDisplay,
          dogCount: dogCount,
          roomNumber: room ? room.number : '未知房间',
          checkInTime: manager.formatDateTime(checkIn),
          checkOutTime: manager.formatDateTime(checkOut),
          checkInTimeRaw: booking.checkInTime,
          checkOutTimeRaw: booking.checkOutTime,
          checkedIn: booking.checkedIn,
          status
        };
      });

    this.setData({ activeBookings });
  },

  // 取消预约
  cancelBooking(e) {
    const bookingId = e.currentTarget.dataset.id;
    const app = getApp();
    const manager = app.getManager();

    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个预约吗？',
      success: (res) => {
        if (res.confirm) {
          const success = manager.cancelBooking(bookingId);
          if (success) {
            app.showMessage('预约已取消', 'success');
            this.loadActiveBookings();
            this.updateAvailableRooms();
          } else {
            app.showMessage('取消失败', 'error');
          }
        }
      }
    });
  },

  // 确认到店
  checkInDog(e) {
    const bookingId = e.currentTarget.dataset.id;
    const app = getApp();
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
        this.loadActiveBookings();
      } else {
        app.showMessage('操作失败', 'error');
      }
    }
  },

  // 修改预约
  modifyBooking(e) {
    const bookingId = e.currentTarget.dataset.id;
    const app = getApp();

    // 获取当前页面栈
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    const isAlreadyOnBookingPage = currentPage.route === 'pages/booking/booking';

    if (isAlreadyOnBookingPage) {
      // 已经在寄养预约页面，直接加载预约数据
      this.initForm({ bookingId: parseInt(bookingId) });
    } else {
      // 在其他页面，设置全局导航数据并跳转
      app.globalData.bookingNavigationData = {
        type: 'modifyBooking',
        bookingId: parseInt(bookingId)
      };
      // 切换到寄养预约tab页面
      wx.switchTab({
        url: '/pages/booking/booking',
        fail: (err) => {
          console.error('切换tab失败:', err);
          // 如果切换失败，尝试使用reLaunch
          wx.reLaunch({
            url: '/pages/booking/booking'
          });
        }
      });
    }
  },

  // 查找空房
  findAvailableRooms() {
    const app = getApp();
    const { selectedRoomTypeIndex, checkInDate, checkInTime, checkOutDate, checkOutTime } = this.data;

    // 检查必要字段
    if (selectedRoomTypeIndex < 0) {
      app.showMessage('请选择房间类型', 'error');
      return;
    }
    if (!checkInDate || !checkInTime || !checkOutDate || !checkOutTime) {
      app.showMessage('请先选择完整的入住和离店时间', 'error');
      return;
    }

    // 检查时间合理性
    const combineDateTime = (dateStr, timeStr) => {
      return `${dateStr}T${timeStr}`;
    };
    const checkInDateTime = combineDateTime(checkInDate, checkInTime);
    const checkOutDateTime = combineDateTime(checkOutDate, checkOutTime);

    if (new Date(checkInDateTime) >= new Date(checkOutDateTime)) {
      app.showMessage('离店时间必须晚于入住时间', 'error');
      return;
    }

    // 显示结果并更新可用房间
    this.setData({
      showAvailableRoomsResult: true
    });
    this.updateAvailableRooms();
  },

  // 更新是否可以查找空房
  updateCanFindAvailableRooms() {
    const { selectedRoomTypeIndex, checkInDate, checkInTime, checkOutDate, checkOutTime } = this.data;

    // 组合日期和时间，格式为 "YYYY-MM-DDTHH:mm"
    const combineDateTime = (dateStr, timeStr) => {
      return dateStr && timeStr ? `${dateStr}T${timeStr}` : '';
    };

    const checkInDateTime = combineDateTime(checkInDate, checkInTime);
    const checkOutDateTime = combineDateTime(checkOutDate, checkOutTime);

    const canFind = selectedRoomTypeIndex >= 0 &&
                    checkInDate && checkInTime && checkOutDate && checkOutTime &&
                    new Date(checkInDateTime) < new Date(checkOutDateTime);

    this.setData({ canFindAvailableRooms: canFind });
  },

  // 显示狗狗搜索模态框
  showDogSearchModal() {
    this.setData({
      showDogSearchModal: true,
      dogSearchQuery: '',
      dogSearchResults: []
    });
  },

  // 关闭狗狗搜索模态框
  closeDogSearchModal() {
    this.setData({
      showDogSearchModal: false,
      dogSearchQuery: '',
      dogSearchResults: []
    });
  },

  // 狗狗搜索输入
  onDogSearchInput(e) {
    const query = e.detail.value;
    this.setData({
      dogSearchQuery: query
    });

    // 实时搜索
    if (query.trim()) {
      const app = getApp();
      const manager = app.getManager();
      const searchResults = manager.searchDogs(query);

      // 格式化搜索结果
      const dogSearchResults = searchResults.map(dog => ({
        id: dog.id,
        name: dog.name,
        owner: dog.owner,
        phone: dog.phone,
        breed: dog.breed
      }));

      this.setData({
        dogSearchResults
      });
    } else {
      this.setData({
        dogSearchResults: []
      });
    }
  },

  // 选择搜索结果中的狗狗
  selectDogFromSearch(e) {
    const dogId = e.currentTarget.dataset.id;
    const app = getApp();
    const manager = app.getManager();
    const dogs = manager.getDogs();

    // 找到选中的狗狗
    const selectedDog = dogs.find(dog => dog.id === parseInt(dogId));
    if (!selectedDog) {
      app.showMessage('狗狗数据不存在', 'error');
      return;
    }

    const { selectedDogs } = this.data;

    // 检查是否已经选择了这只狗狗
    const alreadySelected = selectedDogs.some(dog => dog.id === selectedDog.id);
    if (alreadySelected) {
      app.showMessage('这只狗狗已经添加过了', 'info');
      this.closeDogSearchModal();
      return;
    }

    // 添加到已选择列表
    const newSelectedDog = {
      id: selectedDog.id,
      name: selectedDog.name,
      owner: selectedDog.owner,
      phone: selectedDog.phone,
      breed: selectedDog.breed
    };

    // 同时添加到下拉选项（如果不存在）
    const { dogOptions } = this.data;
    let selectedDogIndex = dogOptions.findIndex(option => option.value === selectedDog.id);

    if (selectedDogIndex === -1) {
      // 如果不在选项中，添加到选项列表
      const newDogOption = {
        value: selectedDog.id,
        label: `${selectedDog.name} (${selectedDog.owner}, ${selectedDog.phone})`
      };

      // 添加新选项（如果当前不在编辑模式，需要保留"添加狗狗"选项）
      let updatedDogOptions = [...dogOptions];
      if (!this.data.isEditingBooking) {
        // 移除最后的"添加狗狗"选项，然后添加新选项，再添加回"添加狗狗"选项
        const addDogOption = updatedDogOptions.pop(); // 移除"添加狗狗"
        updatedDogOptions.push(newDogOption);
        updatedDogOptions.push(addDogOption);
      } else {
        updatedDogOptions.push(newDogOption);
      }

      // 更新选项
      this.setData({
        dogOptions: updatedDogOptions
      });
    }

    this.setData({
      selectedDogs: [...selectedDogs, newSelectedDog],
      selectedDogIndex: -1  // 重置选择器
    });

    // 关闭搜索模态框
    this.closeDogSearchModal();

    // 更新可用房间和创建预约状态
    this.updateAvailableRooms();
    this.updateCanCreateBooking();
  },

  // 移除已选择的狗狗
  removeSelectedDog(e) {
    const dogId = e.currentTarget.dataset.id;
    const { selectedDogs } = this.data;

    const updatedSelectedDogs = selectedDogs.filter(dog => dog.id !== parseInt(dogId));
    this.setData({
      selectedDogs: updatedSelectedDogs
    });

    // 更新创建预约状态
    this.updateCanCreateBooking();
  }
});
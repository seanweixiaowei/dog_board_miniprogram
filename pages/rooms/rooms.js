// pages/rooms/rooms.js
const app = getApp();

Page({
  data: {
    rooms: [],
    showModal: false,
    isEditing: false,
    currentRoom: {
      id: '',
      number: '',
      type: 'standard',
      notes: '',
      price: 98
    },
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
    roomTypeIndex: 0,
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

    this.loadRooms();
  },

  onShow() {
    this.loadRooms();
  },

  onPullDownRefresh() {
    this.loadRooms();
    wx.stopPullDownRefresh();
  },

  loadRooms() {
    const manager = app.getManager();
    const rooms = manager.getRooms();
    this.setData({ rooms });
  },

  // 显示添加房间模态框
  showAddRoomModal() {
    this.setData({
      showModal: true,
      isEditing: false,
      roomTypeIndex: 0,
      currentRoom: {
        id: '',
        number: '',
        type: 'standard',
        notes: '',
        price: 98
      }
    });
  },

  // 编辑房间
  editRoom(e) {
    const roomId = e.currentTarget.dataset.id;
    const manager = app.getManager();
    const rooms = manager.getRooms();
    const room = rooms.find(r => r.id === roomId);

    if (room) {
      // 计算房间类型对应的索引
      const roomTypeIndex = this.data.roomTypeOptions.findIndex(t => t.value === room.type);
      this.setData({
        showModal: true,
        isEditing: true,
        roomTypeIndex: roomTypeIndex >= 0 ? roomTypeIndex : 0,
        currentRoom: { ...room }
      });
    }
  },

  // 删除房间
  deleteRoom(e) {
    const roomId = e.currentTarget.dataset.id;
    const manager = app.getManager();

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个房间吗？此操作不可恢复。',
      success: (res) => {
        if (res.confirm) {
          const success = manager.deleteRoom(roomId);
          if (success) {
            app.showMessage('房间删除成功！', 'success');
            this.loadRooms();
          } else {
            app.showMessage('删除失败', 'error');
          }
        }
      }
    });
  },

  // 房间类型变更
  onRoomTypeChange(e) {
    const index = e.detail.value;
    const value = this.data.roomTypeOptions[index].value;
    const priceMap = {
      'standard': 98,
      'deluxe': 128,
      'vip': 198
    };

    this.setData({
      roomTypeIndex: index,
      'currentRoom.type': value,
      'currentRoom.price': priceMap[value] || 98
    });
  },

  // 保存房间
  saveRoom(e) {
    const formData = e.detail.value;
    const manager = app.getManager();

    const roomData = {
      number: formData.roomNumber,
      type: this.data.currentRoom.type,
      notes: formData.roomNotes,
      price: this.data.currentRoom.price
    };

    // 如果是编辑模式，保留原状态；否则默认为可用
    if (formData.roomId) {
      roomData.id = parseInt(formData.roomId);
      // 使用当前房间的状态，如果不存在则默认为可用
      roomData.status = this.data.currentRoom.status || 'available';
    } else {
      roomData.status = 'available';
    }

    let success = false;
    let message = '';

    if (formData.roomId) {
      success = manager.updateRoom(roomData);
      message = success ? '房间更新成功！' : '更新失败，请重试';
    } else {
      const newId = manager.addRoom(roomData);
      success = !!newId;
      message = success ? '房间添加成功！' : '添加失败，请重试';
    }

    if (success) {
      app.showMessage(message, 'success');
      this.closeModal();
      this.loadRooms();
    } else {
      app.showMessage(message, 'error');
    }
  },

  // 关闭模态框
  closeModal() {
    this.setData({ showModal: false });
  }
});
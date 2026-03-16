// pages/dogs/dogs.js
const app = getApp();

Page({
  data: {
    dogs: [],
    filteredDogs: [],
    searchQuery: '',
    showModal: false,
    isEditing: false,
    autoAddRequested: false, // 标记是否来自预约页面的自动添加请求
    currentDog: {
      id: '',
      name: '',
      gender: 'male',
      breed: '',
      age: '',
      bitesPeople: false,
      bitesDogs: false,
      vaccinated: true,
      neutered: false,
      dewormed: false,
      illnesses: '',
      owner: '',
      phone: '',
      specialNotes: ''
    },
    genderOptions: [
      { value: 'male', label: '公' },
      { value: 'female', label: '母' },
      { value: 'unknown', label: '未知' }
    ],
    genderIndex: 0,
    isAdmin: false
  },

  onLoad(options) {
    // 检查用户是否已登录
    const app = getApp();
    if (!app.checkLogin()) {
      return;
    }

    // 检查用户权限
    const isAdmin = app.isAdmin();
    this.setData({ isAdmin });

    this.loadDogs();

    // 检查是否来自预约页面的自动添加请求
    if (options && options.autoAdd === '1') {
      this.setData({
        autoAddRequested: true
      }, () => {
        // 延迟打开模态框，确保页面渲染完成
        setTimeout(() => {
          this.showAddDogModal();
        }, 300);
      });
    }
  },

  onShow() {
    this.loadDogs();
  },

  onPullDownRefresh() {
    this.loadDogs();
    wx.stopPullDownRefresh();
  },

  loadDogs() {
    const manager = app.getManager();
    const dogs = manager.getDogs();
    const bookings = manager.getBookings();

    // 标记狗狗状态
    const dogsWithStatus = dogs.map(dog => {
      const activeBooking = bookings.find(b => b.dogId === dog.id && b.status === 'active');
      return {
        ...dog,
        status: activeBooking ? '在店' : '离店',
        hasBooking: !!activeBooking
      };
    });

    this.setData({
      dogs: dogsWithStatus
    }, () => {
      // 加载后应用当前搜索查询
      this.searchDogs();
    });
  },

  // 搜索输入
  onSearchInput(e) {
    const query = e.detail.value;
    this.setData({
      searchQuery: query
    });
    // 实时搜索
    this.searchDogs();
  },

  // 搜索狗狗
  searchDogs() {
    const query = this.data.searchQuery.trim();
    const manager = app.getManager();
    const bookings = manager.getBookings();
    let filteredDogs;

    if (query) {
      const searchResults = manager.searchDogs(query);
      // 为搜索结果标记状态
      filteredDogs = searchResults.map(dog => {
        const activeBooking = bookings.find(b => b.dogId === dog.id && b.status === 'active');
        return {
          ...dog,
          status: activeBooking ? '在店' : '离店',
          hasBooking: !!activeBooking
        };
      });
    } else {
      // 没有查询时显示所有狗狗
      const dogs = manager.getDogs();
      // 标记狗狗状态
      filteredDogs = dogs.map(dog => {
        const activeBooking = bookings.find(b => b.dogId === dog.id && b.status === 'active');
        return {
          ...dog,
          status: activeBooking ? '在店' : '离店',
          hasBooking: !!activeBooking
        };
      });
    }

    this.setData({ filteredDogs });
  },

  // 显示添加狗狗模态框
  showAddDogModal() {
    this.setData({
      showModal: true,
      isEditing: false,
      autoAddRequested: false, // 重置自动添加标志
      genderIndex: 0,
      currentDog: {
        id: '',
        name: '',
        gender: 'male',
        breed: '',
        age: '',
        bitesPeople: false,
        bitesDogs: false,
        vaccinated: true,
        neutered: false,
        dewormed: false,
        illnesses: '',
        owner: '',
        phone: '',
        specialNotes: ''
      }
    });
  },

  // 编辑狗狗
  editDog(e) {
    const dogId = e.currentTarget.dataset.id;
    const manager = app.getManager();
    const dogs = manager.getDogs();
    const dog = dogs.find(d => d.id === dogId);

    if (dog) {
      // 计算性别对应的索引
      const genderIndex = this.data.genderOptions.findIndex(g => g.value === dog.gender);

      // 确保狗狗数据包含所有必要的布尔字段，使用默认值填充缺失字段
      const defaultDog = {
        bitesPeople: false,
        bitesDogs: false,
        vaccinated: true,
        neutered: false,
        dewormed: false,
        illnesses: '',
        specialNotes: ''
      };

      const dogData = {
        ...defaultDog,
        ...dog
      };

      this.setData({
        showModal: true,
        isEditing: true,
        genderIndex: genderIndex >= 0 ? genderIndex : 0,
        currentDog: dogData
      });
    }
  },

  // 删除狗狗
  deleteDog(e) {
    const dogId = e.currentTarget.dataset.id;
    const manager = app.getManager();

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个狗狗档案吗？此操作不可恢复。',
      success: (res) => {
        if (res.confirm) {
          const success = manager.deleteDog(dogId);
          if (success) {
            app.showMessage('狗狗档案删除成功！', 'success');
            this.loadDogs();
          } else {
            app.showMessage('删除失败', 'error');
          }
        }
      }
    });
  },

  // 性别变更
  onGenderChange(e) {
    const index = e.detail.value;
    const value = this.data.genderOptions[index].value;
    this.setData({
      genderIndex: index,
      'currentDog.gender': value
    });
  },

  // 保存狗狗
  saveDog(e) {
    console.log('saveDog called, formData:', e.detail.value);
    const formData = e.detail.value;
    const manager = app.getManager();

    // 调试：打印所有表单字段
    console.log('Form fields:', Object.keys(formData));
    console.log('dogName:', formData.dogName);
    console.log('dogOwner:', formData.dogOwner);
    console.log('dogPhone:', formData.dogPhone);
    console.log('currentDog.gender:', this.data.currentDog.gender);

    const dogData = {
      name: formData.dogName || '',
      gender: this.data.currentDog.gender || 'male',
      breed: formData.dogBreed || '',
      age: formData.dogAge || '',
      bitesPeople: formData.dogBitesPeople === 'true' || formData.dogBitesPeople === true,
      bitesDogs: formData.dogBitesDogs === 'true' || formData.dogBitesDogs === true,
      vaccinated: formData.dogVaccinated === 'true' || formData.dogVaccinated === true,
      neutered: formData.dogNeutered === 'true' || formData.dogNeutered === true,
      dewormed: formData.dogDewormed === 'true' || formData.dogDewormed === true,
      illnesses: formData.dogIllnesses || '',
      owner: formData.dogOwner || '',
      phone: formData.dogPhone || '',
      specialNotes: formData.dogSpecialNotes || ''
    };

    console.log('Processed dogData:', dogData);

    // 验证必要字段
    if (!dogData.name.trim()) {
      app.showMessage('狗狗名字不能为空', 'error');
      return;
    }
    if (!dogData.owner.trim()) {
      app.showMessage('主人姓名不能为空', 'error');
      return;
    }
    if (!dogData.phone.trim()) {
      app.showMessage('主人电话不能为空', 'error');
      return;
    }

    let success = false;
    let message = '';

    if (formData.dogId) {
      dogData.id = parseInt(formData.dogId);
      success = manager.updateDog(dogData);
      message = success ? '狗狗档案更新成功！' : '更新失败，请重试';
    } else {
      const newId = manager.addDog(dogData);
      success = !!newId;
      message = success ? '狗狗档案添加成功！' : '添加失败，请重试';
    }

    if (success) {
      app.showMessage(message, 'success');
      this.closeModal();
      this.loadDogs();
    } else {
      app.showMessage(message, 'error');
    }
  },

  // 预约狗狗
  bookDog(e) {
    const dogId = e.currentTarget.dataset.id;
    const app = getApp();
    // 设置全局导航数据
    app.globalData.bookingNavigationData = {
      type: 'bookDog',
      dogId: parseInt(dogId)
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
  },

  // 关闭模态框
  closeModal() {
    this.setData({
      showModal: false,
      autoAddRequested: false
    });
  }
});
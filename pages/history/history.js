// pages/history/history.js
const app = getApp();

Page({
  data: {
    searchQuery: '',
    selectedTypeIndex: 0,
    searchResults: [],
    hasSearched: false,
    typeOptions: [
      { value: 'all', label: '全部记录' },
      { value: 'dog', label: '狗狗记录' },
      { value: 'room', label: '房间记录' }
    ]
  },

  onLoad() {
    // 检查用户是否已登录
    const app = getApp();
    if (!app.checkLogin()) {
      return;
    }
    // 可以加载一些初始数据
  },

  onShow() {
    // 页面显示时刷新
  },

  onPullDownRefresh() {
    if (this.data.searchQuery) {
      this.searchHistory();
    }
    wx.stopPullDownRefresh();
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchQuery: e.detail.value
    });
  },

  // 类型变更
  onTypeChange(e) {
    this.setData({
      selectedTypeIndex: e.detail.value
    });
  },

  // 搜索历史记录
  searchHistory() {
    const { searchQuery, selectedTypeIndex, typeOptions } = this.data;
    const manager = app.getManager();
    const type = typeOptions[selectedTypeIndex].value;

    const results = manager.searchHistory(searchQuery, type);

    this.setData({
      searchResults: results,
      hasSearched: true
    });
  },

  // 格式化日期时间
  formatDateTime(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
});
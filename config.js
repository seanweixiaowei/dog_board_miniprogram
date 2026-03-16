// config.js - 环境配置
const config = {
  // 开发环境配置
  development: {
    apiBaseUrl: 'http://39.102.78.230:3000', // HTTP 用于开发
    debug: true
  },
  // 生产环境配置（需要HTTPS）
  production: {
    // 注意：生产环境必须使用HTTPS，并且域名需要在微信小程序后台配置
    // 这里暂时使用HTTP用于测试，正式上线前需要修改为HTTPS并配置合法域名
    apiBaseUrl: 'http://39.102.78.230:3000', // 正式上线前需要改为HTTPS
    debug: false
  }
};

// 判断当前环境
const getEnv = () => {
  // 微信小程序中可以通过 wx.getAccountInfoSync() 获取环境信息
  try {
    const accountInfo = wx.getAccountInfoSync();
    const envVersion = accountInfo.miniProgram.envVersion;

    // 开发版: 'develop', 体验版: 'trial', 正式版: 'release'
    if (envVersion === 'develop') {
      return 'development';
    } else if (envVersion === 'trial' || envVersion === 'release') {
      return 'production';
    }
  } catch (e) {
    console.error('获取环境信息失败:', e);
  }

  // 默认返回开发环境
  return 'development';
};

// 导出配置
module.exports = {
  config,
  getEnv,
  // 当前配置
  current: config[getEnv()]
};
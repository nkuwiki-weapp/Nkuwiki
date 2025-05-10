const { storage } = require("../../utils/util");

Component({
  options: {
    // 启用简化的样式隔离
    styleIsolation: 'isolated',
    // 允许页面样式覆盖组件样式
    pureDataPattern: /^_/,
    multipleSlots: true // 启用多slot支持
  },

  properties: {
    // 导航栏标题
    title: {
      type: String,
      value: ''
    },
    // 文本颜色
    textColor: {
      type: String,
      value: '#000000'
    },
    // 背景颜色
    bgColor: {
      type: String,
      value: '#ffffff'
    },
    // 是否显示阴影
    showShadow: {
      type: Boolean,
      value: true
    },
    // 是否自动调整标题宽度
    autoAdjustTitleWidth: {
      type: Boolean,
      value: true
    },
    // 快捷按钮属性 (简化调用)
    showBack: {
      type: Boolean,
      value: true,
      observer: function(newVal) {
        this.updateQuickButtons();
      }
    },
    showHome: {
      type: Boolean,
      value: false,
      observer: function(newVal) {
        this.updateQuickButtons();
      }
    },
    showNotification: {
      type: Boolean,
      value: false,
      observer: function(newVal) {
        this.updateQuickButtons();
      }
    },
    showAvatar: {
      type: Boolean,
      value: true,
      observer: function(newVal) {
        this.updateQuickButtons();
      }
    },
    // 高级配置 (完整配置，优先级更高)
    navButtons: {
      type: Array,
      value: [],
      observer: function(newVal) {
        this.initNavButtons();
      }
    },
  },

  data: {
    statusBarHeight: 0,
    navBarHeight: 48,
    totalHeight: 0,
    notificationLeft: '140rpx',
    buttons: [],
    // 导航按钮映射，方便在WXML和方法中使用
    buttonMap: {},
    // 默认按钮配置
    defaultButtonConfig: {
      back: {
        type: 'back',
        icon: 'back',
        text: '返回',
        show: false
      },
      home: {
        type: 'home',
        icon: 'home',
        text: '首页',
        show: false
      },
      logo: {
        type: 'logo',
        icon: 'logo',
        show: false
      },
      notification: {
        type: 'notification',
        icon: 'notification',
        unreadIcon: 'notification-unread',
        show: false,
        url: '/pages/notification/notification',
        hasUnread: false
      },
      avatar: {
        type: 'avatar',
        icon: 'profile',
        show: false,
        url: '/pages/profile/profile'
      }
    },
    titleMaxWidth: '60%', // 标题最大宽度，会根据按钮自动调整
    layout: {
      leftWidth: 0,
      rightWidth: 0
    }
  },

  lifetimes: {
    attached() {
      this.initSystemInfo();
      // 初始化时优先处理navButtons，如果为空，则使用快捷属性
      if (this.properties.navButtons && this.properties.navButtons.length > 0) {
        this.initNavButtons();
      } else {
        this.updateQuickButtons();
      }
    }
  },
  
  observers: {
    'navButtons': function(navButtons) {
      this.initNavButtons();
    }
  },

  methods: {
    // 初始化系统信息
    initSystemInfo() {
      try {
        // 使用新API替代旧的getSystemInfoSync
        const appBaseInfo = wx.getAppBaseInfo();
        const windowInfo = wx.getWindowInfo();
        
        // 状态栏高度
        const statusBarHeight = windowInfo.statusBarHeight || 20;
        
        // 根据不同平台设置导航栏高度
        let navBarHeight = 48;
        if (appBaseInfo.platform === 'android') {
          navBarHeight = 48;
        } else if (appBaseInfo.platform === 'ios') {
          navBarHeight = 44;
        }
        
        // 设置总高度
        const totalHeight = statusBarHeight + navBarHeight;
        
        this.setData({
          statusBarHeight,
          navBarHeight,
          totalHeight,
          // 保存系统信息以供其他方法使用
          _systemInfo: {
            platform: appBaseInfo.platform,
            windowWidth: windowInfo.windowWidth
          }
        });

        // 延迟执行一次布局计算
        setTimeout(() => this.updateLayout(), 50);
      } catch (err) {
        console.error('初始化导航栏尺寸失败:', err);
        // 使用默认值
        this.setData({
          statusBarHeight: 20,
          navBarHeight: 48,
          totalHeight: 68
        });
      }
    },

    // 根据快捷属性更新按钮
    updateQuickButtons() {
      // 如果已经通过navButtons设置，则不处理
      if (this.properties.navButtons && this.properties.navButtons.length > 0) {
        return;
      }
      
      const buttons = [];
      
      // 添加返回按钮
      if (this.properties.showBack) {
        buttons.push({
          type: 'back',
          icon: 'back',
          text: '返回',
          showText: false,
          show: true
        });
      }
      
      // 添加首页按钮
      if (this.properties.showHome) {
        buttons.push({
          type: 'home',
          icon: 'home',
          text: '首页',
          showText: false,
          show: true
        });
      }
      if(this.properties.showNotification){
        const notificationButton = {...this.data.defaultButtonConfig.notification, show: true};
        notificationButton.position = 'left';
        buttons.push(notificationButton);
      }
      // 添加头像按钮 (左侧)
      if (this.properties.showAvatar) {
        buttons.push({
          type: 'avatar',
          icon: 'profile',
          position: 'left',
          show: true
        });
      }
      
      this.setData({ buttons }, () => {
        this.updateLayout();
      });
    },

    // 初始化导航按钮
    initNavButtons() {
      const navButtons = this.properties.navButtons || [];
      const buttons = [];
      const defaultButtons = {
        back: {
          type: 'back',
          icon: 'back',
          text: '返回',
          showText: false
        },
        home: {
          type: 'home',
          icon: 'home',
          text: '首页',
          showText: false
        },
        avatar: {
          type: 'avatar',
          icon: 'profile',
          position: 'right'
        },
        notification: {
          type: 'notification',
          icon: 'notification',
          unreadIcon: 'notification-unread',
          position: 'right',
          hasUnread: false
        }
      };

      // 处理导航按钮配置
      navButtons.forEach(config => {
        if (!config || !config.type) return;
        
        const type = config.type;
        const defaultConfig = defaultButtons[type] || {};
        
        // 合并默认配置和自定义配置
        const buttonConfig = {
          ...defaultConfig,
          ...config,
          show: config.show !== false // 除非明确设置为false，否则默认显示
        };
        
        buttons.push(buttonConfig);
      });
      
      this.setData({ buttons }, () => {
        this.updateLayout();
      });
    },

    // 更新布局计算
    updateLayout() {
      if (!this.data.buttons || this.data.buttons.length === 0) return;
      
      try {
        // 获取左右区域宽度
        const query = this.createSelectorQuery();
        
        // 获取左侧区域宽度
        query.select('.left-area').boundingClientRect();
        
        // 获取右侧区域宽度
        query.select('.right-area').boundingClientRect();
        
        query.exec(res => {
          if (!res || !res[0] || !res[1]) return;
          
          const leftWidth = res[0].width || 0;
          const rightWidth = res[1].width || 0;
          
          // 动态计算标题最大宽度
          let titleMaxWidth = '60%';
          
          if (this.properties.autoAdjustTitleWidth) {
            // 获取可用空间(总宽度减去左右区域宽度和安全边距)
            const windowWidth = this.data._systemInfo?.windowWidth || wx.getWindowInfo().windowWidth || 375;
            const safetyMargin = 32; // 两侧安全边距(rpx)
            const rpxRatio = 750 / windowWidth; // rpx与px的转换比例
            
            // 计算左右区域的rpx宽度
            const leftRpx = leftWidth * rpxRatio;
            const rightRpx = rightWidth * rpxRatio;
            
            // 计算标题可用空间
            const availableWidth = 750 - leftRpx - rightRpx - safetyMargin;
            
            // 将可用空间转换为百分比
            const percentAvailable = Math.floor((availableWidth / 750) * 100);
            
            // 限制在30%~80%之间
            const finalPercent = Math.min(Math.max(percentAvailable, 30), 80);
            
            titleMaxWidth = `${finalPercent}%`;
          }
          
          this.setData({
            layout: {
              leftWidth,
              rightWidth
            },
            computedStyle: {
              titleMaxWidth
            }
          });
        });
      } catch (err) {
        console.error('更新导航布局失败:', err);
      }
    },

    // 处理按钮点击事件
    handleButtonTap(e) {
      const { type } = e.currentTarget.dataset;
      if (!type) return;
      
      // 触发点击事件，允许外部处理
      const detail = { type };
      const buttonHandled = this.triggerEvent('buttonTap', detail);
      
      // 如果外部已处理，则不执行默认行为
      if (buttonHandled === false) {
        return;
      }
      
      // 默认行为处理
      this.handleDefaultButtonAction(type);
    },
    
    // 处理默认按钮行为
    handleDefaultButtonAction(type) {
      switch (type) {
        case 'back':
          // 检查当前页面路径
          const pages = getCurrentPages();
          const currentPage = pages[pages.length - 1];
          const pagePath = currentPage.route || currentPage.__route__;
          
          console.debug('当前页面路径:', pagePath);
          
          // 发帖页面的返回按钮直接跳转到首页，避免导航问题
          if (pagePath === 'pages/post/post' || pagePath === '/pages/post/post') {
            console.debug('从发帖页返回到首页');
            wx.switchTab({
              url: '/pages/index/index',
              success: (res) => {
                console.debug('成功返回首页', res);
              },
              fail: (err) => {
                console.error('返回首页失败:', err);
                // switchTab失败时尝试reLaunch
                wx.reLaunch({
                  url: '/pages/index/index'
                });
              }
            });
            return; // 重要：添加return防止执行下面的代码
          } else {
              // 其他页面使用常规返回
              wx.navigateBack();
            }
          
          break;
          
        case 'home':
          wx.switchTab({ url: '/pages/index/index' });
          break;
          
        case 'avatar':
          wx.navigateTo({ url: '/pages/profile/profile' });
          break;
          
        case 'notification':
          wx.navigateTo({ url: '/pages/notification/notification' });
          break;
          
        default:
          // 其他类型的按钮不执行默认行为
          break;
      }
    },

    // 初始化按钮映射
    initButtonMap() {
      const buttonMap = {};
      
      // 处理传入的按钮配置，与默认配置合并
      this.properties.navButtons.forEach(button => {
        const type = button.type;
        const defaultButton = this.data.defaultButtonConfig[type];
        
        // 如果存在默认配置，则合并配置
        if (defaultButton) {
          buttonMap[type] = { ...defaultButton, ...button, show: true };
        } else {
          // 对于自定义按钮，直接使用传入的配置
          buttonMap[type] = { ...button, show: true };
        }
      });
      
      this.setData({ buttonMap });
    },

    calculateNotificationPosition() {
      // 基础位置，只有logo的情况
      let left = 100;
      
      // 如果有返回按钮，增加距离
      if (this.data.buttonMap.back && this.data.buttonMap.back.show) {
        left += 72;
      }
      
      // 如果有主页按钮，增加距离
      if (this.data.buttonMap.home && this.data.buttonMap.home.show) {
        left += 72;
      }
      
      // 如果没有logo，减少距离
      if (this.data.buttonMap.logo && !this.data.buttonMap.logo.show) {
        left -= 100;
      }
      
      this.setData({
        notificationLeft: `${left}rpx`
      });
    },

    onButtonTap(e) {
      const type = e.currentTarget.dataset.type;
      const button = this.data.buttonMap[type];
      
      if (!button) return;

      // 先触发事件，给父组件机会处理（如果有自定义处理）
      const eventDetail = { type, button };
      const eventOptions = { bubbles: true, composed: true };
      const eventResult = this.triggerEvent(type, eventDetail, eventOptions);
      
      // 检查是否阻止了默认行为
      if (eventResult === false) {
        return;
      }
      
      // 默认行为
      switch (type) {
        case 'back':
          // 检查当前页面路径
          const pages = getCurrentPages();
          const currentPage = pages[pages.length - 1];
          const pagePath = currentPage.route || currentPage.__route__;
          
          console.debug('当前页面路径:', pagePath);
          
          // 发帖页面的返回按钮直接跳转到首页，避免导航问题
          if (pagePath === 'pages/post/post' || pagePath === '/pages/post/post') {
            console.debug('从发帖页返回到首页');
            wx.switchTab({
              url: '/pages/index/index',
              success: (res) => {
                console.debug('成功返回首页', res);
              },
              fail: (err) => {
                console.error('返回首页失败:', err);
                // switchTab失败时尝试reLaunch
                wx.reLaunch({
                  url: '/pages/index/index'
                });
              }
            });
            return; // 重要：添加return防止执行下面的代码
          } else if (button.url) {
            wx.navigateTo({
              url: button.url
            });
          } else {
            // 其他页面使用常规返回
            wx.navigateBack();
          }
          break;
        case 'home':
          wx.switchTab({
            url: button.url || '/pages/index/index'
          });
          break;
        case 'notification':
          wx.navigateTo({
            url: button.url || '/pages/notification/notification'
          });
          break;
        case 'avatar':
          wx.navigateTo({
            url: button.url || '/pages/profile/profile'
          });
          break;
        default:
          // 自定义按钮类型
          if (button.url) {
            if (button.url.startsWith('/pages/tabBar/')) {
              wx.switchTab({ url: button.url });
            } else {
              wx.navigateTo({ url: button.url });
            }
          }
          break;
      }
    }
  }
}) 
const behaviors = require('../../behaviors/index');
const { storage, getAboutInfo, getOpenID } = require('../../utils/util');
// 常量配置
const MENU_CONFIG = {
  SETTINGS: {
    items: [
      {
        id: 'about',
        icon: true,
        iconName: 'about',
        title: '关于我们',
        path: '/pages/about/about'
      },
      {
        id: 'setting',
        icon: true,
        iconName: 'setting',
        title: '设置',
        path: '/pages/profile/setting/setting'
      },
      {
        id: 'feedback',
        icon: true,
        iconName: 'feedback',
        title: '反馈',
        path: '/pages/profile/feedback/feedback'
      },
      {
        id: 'logout',
        icon: true,
        iconName: 'logout',
        title: '退出登录',
        path: '/pages/profile/logout/logout'
      }
    ]
  }
};

Page({
  behaviors: [
    behaviors.baseBehavior,
    behaviors.authBehavior, 
    behaviors.userBehavior,
    behaviors.notificationBehavior,
    behaviors.weuiBehavior
  ],

  data: {
    userInfo: null,
    openid: '',
    stats: {
      posts: 0,
      likes: 0,
      favorites: 0,
      comments: 0
    },
    loading: false,
    error: false,
    errorMsg: '',
    refreshing: false,
    settingItems: [],
    hasUnreadNotification: false,
    // 状态栏高度
    statusBarHeight: 0,
    // 用户详情页相关数据
    otherUserInfo: null,
    isFromExternalView: false
  },

  async onLoad(options) {
    const targetOpenid = options.openid || options.id;
    const currentOpenid = storage.get('openid');
    const isFromExternalView = options.from === 'post' || options.from === 'card' || options.from === 'comment';
    
    this.setData({ 
      openid: currentOpenid || '',
      isFromExternalView: isFromExternalView
    });

    console.debug('Profile页面加载，目标openid:', targetOpenid, '当前用户openid:', currentOpenid, '来源:', options.from);

    if (targetOpenid && targetOpenid !== currentOpenid) {
      // 查看其他用户的个人资料
      await this.syncUserAndInitPage(targetOpenid);
    } else {
      // 查看自己的个人资料
      await this.syncUserAndInitPage();
    }
  },

  async onShow() {
    // 如果是从外部视图进入（如点击他人头像），则不通过temp_profile_openid改变当前页面
    if (this.data.isFromExternalView) {
      return;
    }
    
    // 检查是否有从其他页面传入的临时openid
    try {
      const tempOpenid = this.getStorage('temp_profile_openid');
      const currentOpenid = storage.get('openid');
      
      if (tempOpenid && tempOpenid !== currentOpenid) {
        console.debug('检测到临时openid:', tempOpenid, '当前用户openid:', currentOpenid);
        
        // 清除临时openid，避免反复加载
        this.setStorage('temp_profile_openid', null);
        
        // 加载目标用户资料
        await this.syncUserAndInitPage(tempOpenid);
        return;
      }
      
      // 检查是否需要刷新个人资料
      const needRefresh = this.getStorage('needRefreshProfile');
      const profileUpdateTime = wx.getStorageSync('profileUpdateTime');
      
      // 每次从edit页面返回时强制刷新
      const pages = getCurrentPages();
      const previousPage = pages.length > 1 ? pages[pages.length - 2] : null;
      const fromEditPage = previousPage && previousPage.route && previousPage.route.includes('/profile/edit/');
      
      if (needRefresh || profileUpdateTime || fromEditPage) {
        console.debug('检测到需要刷新个人资料, 来源:', 
          needRefresh ? 'needRefresh标记' : '', 
          profileUpdateTime ? 'profileUpdateTime标记' : '',
          fromEditPage ? '从编辑页面返回' : ''
        );
        
        // 清除刷新标志，避免重复刷新
        this.setStorage('needRefreshProfile', null);
        wx.removeStorageSync('profileUpdateTime');
        
        // 重新加载自己的资料
        await this.syncUserAndInitPage();
        return;
      }
    } catch (err) {
      console.debug('检查刷新状态失败:', err);
    }
    
    // 只检查通知状态，用户信息由user-card组件自行检查刷新
    this.checkUnreadNotifications();
  },

  async onPullDownRefresh() {
    this.setData({ refreshing: true });
    
    // 获取当前显示的用户openid
    const currentUserInfo = this.data.userInfo;
    const targetOpenid = currentUserInfo ? currentUserInfo.openid : null;
    
    // 刷新用户资料
    await this.syncUserAndInitPage(targetOpenid);
    
    wx.stopPullDownRefresh();
    this.setData({ refreshing: false });
  },

  // 同步用户并初始化页面
  async syncUserAndInitPage(targetOpenid) {
    this.setData({ loading: true, error: false });
    
    try {
      // 获取当前用户openid
      const currentOpenid = await getOpenID();
      this.setData({ openid: currentOpenid || '' });
      
      // 查看目标用户资料
      if (targetOpenid && targetOpenid !== currentOpenid) {
        console.debug('获取目标用户资料:', targetOpenid);
        const profileRes = await this._getUserProfileByOpenid(targetOpenid);
        
        if (profileRes && profileRes.id) {
          // 获取当前用户与目标用户的关注状态
          try {
            const statusRes = await this._getUserStatusByOpenid(targetOpenid);
            if (statusRes) {
              // 合并关注状态到用户信息中
              profileRes.isFollowed = statusRes.is_following || false;
            }
          } catch (err) {
            console.debug('获取关注状态失败:', err);
          }
          
          // 更新页面数据
          this.setData({
            userInfo: profileRes,
            stats: {
              posts: profileRes.post_count || 0,
              likes: profileRes.like_count || 0,
              favorites: profileRes.favorite_count || 0,
              comments: profileRes.comment_count || 0
            },
            loading: false
          });
          
          // 处理菜单项 - 查看他人主页时保留设置菜单
          this.processMenuItems();
        } else {
          // 获取目标用户失败，显示错误信息
          this.setData({ 
            loading: false,
            error: true,
            errorMsg: '获取用户资料失败'
          });
        }
        return; // 直接返回，不再执行后续代码
      }
      
      // 以下代码只在查看自己的主页时执行
      if (!currentOpenid) {
        this.setData({ 
          userInfo: null, 
          loading: false 
        });
        return;
      }
      
      // 先验证登录状态
      await this._syncUserInfo();
      
      // 获取最新的用户资料（包含统计数据）
      const profileRes = await this._getUserInfo(true);
      
      if (profileRes && profileRes.id) {
        // 更新本地存储
        this.setStorage('userInfo', profileRes);
        
        // 更新全局数据
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.userInfo = profileRes;
        }
        
        // 更新页面数据
        this.setData({
          userInfo: profileRes,
          stats: {
            posts: profileRes.post_count || 0,
            likes: profileRes.like_count || 0,
            favorites: profileRes.favorite_count || 0,
            comments: profileRes.comment_count || 0
          },
          loading: false
        });
        
        // 处理菜单项 - 只在查看自己的主页时显示设置菜单
        this.processMenuItems();
        
        // 检查未读通知
        this.checkUnreadNotifications();
      } else {
        // 只有在确认是认证问题时才重置登录状态
        if (profileRes && (profileRes.code === 401 || profileRes.code === 403)) {
          this.setStorage('userInfo', null);
          this.setStorage('openid', null);
          this.setStorage('isLoggedIn', false);
          
          // 更新全局数据
          const app = getApp();
          if (app && app.globalData) {
            app.globalData.userInfo = null;
            app.globalData.openid = null;
          }
        }
        
        // 更新页面状态
        this.setData({ 
          userInfo: null, 
          loading: false 
        });
      }
    } catch (err) {
      console.debug('同步用户信息失败:', err);
      // 异常不清除登录状态，可能是网络问题
      this.setData({ 
        loading: false,
        error: true,
        errorMsg: '网络异常，请稍后再试'
      });
    }
  },

  // 检查是否有未读通知
  async checkUnreadNotifications() {
    try {
      const hasUnread = await this._checkUnreadNotification();
      
      // 更新通知红点状态和navButtons
      const navButtons = [...this.data.navButtons];
      for (let i = 0; i < navButtons.length; i++) {
        if (navButtons[i].type === "notification") {
          navButtons[i].hasUnread = hasUnread;
          break;
        }
      }
      
      this.setData({
        hasUnreadNotification: hasUnread,
        navButtons
      });
      
      return hasUnread;
    } catch (err) {
      return false;
    }
  },

  // 处理菜单项
  async processMenuItems() {
    try {
      // 获取应用信息
      const appInfo = await getAboutInfo();
      const version = appInfo ? `版本 ${appInfo.version}` : '版本 0.0.1';
      
      // 设置菜单添加额外内容
      const settingItems = MENU_CONFIG.SETTINGS.items.map(item => {
        const newItem = { ...item };
        
        // 添加版本信息到"关于我们"
        if (item.id === 'about') {
          newItem.extraContent = version;
        }
        
        return newItem;
      });
      
      this.setData({
        settingItems
      });
    } catch (err) {
      console.error('获取版本信息失败:', err);
      // 使用默认菜单
      const settingItems = MENU_CONFIG.SETTINGS.items.map(item => {
        const newItem = { ...item };
        if (item.id === 'about') {
          newItem.extraContent = '版本 0.0.1';
        }
        return newItem;
      });
      
      this.setData({
        settingItems
      });
    }
  },

  // 设置菜单点击
  onSettingItemTap(e) {
    const { item } = e.detail;
    this._routeMenuItem(item);
  },
  
  // 设置菜单重试
  onSettingRetry() {
    this.processMenuItems();
  },

  // 导航到编辑页面
  // navigateToEditProfile() {
  //   if (!this.data.userInfo) return;
    
  //   // 直接使用reLaunch跳转到编辑页面
  //   wx.reLaunch({
  //     url: '/pages/profile/edit/edit'
  //   });
  // },
  // 处理菜单项点击路由
  _routeMenuItem(item) {
    if (!item) return;
    
    const userInfo = this.data.userInfo;
    // 对于需要登录的菜单项，先检查登录状态
    if (item.requireLogin && !userInfo) {
      this.showToast('请先登录', 'error');
      return;
    }
    
    // 导航到指定路径
    if (item.path) {
      this.navigateTo(item.path);
    }
  },
});
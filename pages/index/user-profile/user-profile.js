const behaviors = require('../../../behaviors/index');
const { storage } = require('../../../utils/util');

Page({
  behaviors: [
    behaviors.baseBehavior,
    behaviors.authBehavior, 
    behaviors.userBehavior,
    behaviors.notificationBehavior
  ],

  data: {
    userInfo: null,
    stats: {
      posts: 0,
      likes: 0,
      favorites: 0,
      comments: 0,
      following: 0,
      followers: 0
    },
    loading: true,
    error: false,
    errorMsg: '',
    targetOpenid: '',
    isCurrentUser: false,
    currentUserOpenid: '',
    animationData: {},
    showToast: false,
    toastMsg: ''
  },

  async onLoad(options) {
    const targetOpenid = options.openid || options.id;
    const currentOpenid = storage.get('openid');
    
    if (!targetOpenid) {
      console.error('缺少必要参数：openid');
      this.setData({
        error: true,
        errorMsg: '无法加载用户信息，缺少必要参数',
        loading: false
      });
      return;
    }
    
    this.setData({ 
      targetOpenid: targetOpenid,
      currentUserOpenid: currentOpenid || '',
      isCurrentUser: targetOpenid === currentOpenid
    });

    console.debug('用户个人资料页面加载，目标openid:', targetOpenid, '当前用户openid:', currentOpenid);

    // 创建动画实例
    this.animation = wx.createAnimation({
      duration: 300,
      timingFunction: 'ease',
    });

    // 加载用户资料
    await this.loadUserProfile(targetOpenid);
  },

  async loadUserProfile(targetOpenid) {
    this.setData({ loading: true, error: false });
    
    try {
      if (!targetOpenid) {
        throw new Error('缺少用户ID');
      }
      
      // 使用userBehavior中的方法获取用户信息
      const userProfile = await this._getUserProfileByOpenid(targetOpenid);
      
      if (userProfile) {
        // 获取关注状态
        try {
          if (!this.data.isCurrentUser) {
            const statusRes = await this._getUserStatusByOpenid(targetOpenid);
            if (statusRes) {
              userProfile.is_following = statusRes.is_following || false;
            }
          }
        } catch (err) {
          console.debug('获取关注状态失败:', err);
        }
        
        // 更新页面数据
        this.setData({
          userInfo: userProfile,
          stats: {
            posts: userProfile.post_count || 0,
            likes: userProfile.like_count || 0,
            favorites: userProfile.favorite_count || 0,
            comments: userProfile.comment_count || 0,
            following: userProfile.following_count || 0,
            followers: userProfile.follower_count || 0
          },
          loading: false
        });

        // 添加载入动画
        this.animateProfileCard();
      } else {
        throw new Error('获取用户信息失败');
      }
    } catch (err) {
      console.error('加载用户资料失败:', err);
      this.setData({ 
        loading: false, 
        error: true,
        errorMsg: err.message || '加载用户资料失败'
      });
    }
  },

  // 动画效果
  animateProfileCard() {
    this.animation.opacity(0).translateY(20).step({ duration: 0 });
    this.setData({
      animationData: this.animation.export()
    });
    
    setTimeout(() => {
      this.animation.opacity(1).translateY(0).step();
      this.setData({
        animationData: this.animation.export()
      });
    }, 100);
  },

  // 查看用户发布的帖子
  viewUserPosts() {
    wx.navigateTo({
      url: `/pages/search/search?openid=${this.data.targetOpenid}&type=posts`
    });
  },
  
  // 关注用户
  async followUser() {
    if (!this.data.currentUserOpenid) {
      // 未登录，先提示登录
      await this._checkLogin(true);
      return;
    }
    
    try {
      const result = await this._toggleFollow({
        followed_id: this.data.targetOpenid
      });
      
      if (result && result.code === 200) {
        // 更新关注状态
        const isFollowing = result.data.is_following;
        this.setData({
          'userInfo.is_following': isFollowing
        });
        
        // 显示提示
        this.showCustomToast(isFollowing ? '关注成功' : '已取消关注');
        
        // 更新粉丝数
        if (isFollowing) {
          this.setData({
            'stats.followers': this.data.stats.followers + 1
          });
        } else if (this.data.stats.followers > 0) {
          this.setData({
            'stats.followers': this.data.stats.followers - 1
          });
        }
      }
    } catch (err) {
      this.showCustomToast('操作失败');
      console.error('关注操作失败:', err);
    }
  },
  
  // 显示自定义Toast
  showCustomToast(msg, duration = 1500) {
    this.setData({
      showToast: true,
      toastMsg: msg
    });
    
    setTimeout(() => {
      this.setData({
        showToast: false
      });
    }, duration);
  },
  
  // 处理返回按钮点击
  onBack() {
    wx.navigateBack();
  },
  
  // 处理重试按钮点击
  onRetry() {
    this.loadUserProfile(this.data.targetOpenid);
  },
  
  // 跳转到编辑个人资料页面
  editProfile() {
    wx.navigateTo({
      url: '/pages/profile/edit/edit',
      fail: (err) => {
        console.error('跳转到编辑资料页面失败:', err);
      }
    });
  },

  // 处理下拉刷新
  onPullDownRefresh() {
    this.loadUserProfile(this.data.targetOpenid).finally(() => {
      wx.stopPullDownRefresh();
    });
  },
  
  // 页面显示时触发
  onShow() {
    // 如果是查看自己的资料，检查是否需要刷新
    if (this.data.isCurrentUser) {
      const needRefresh = wx.getStorageSync('needRefreshProfile');
      if (needRefresh) {
        wx.removeStorageSync('needRefreshProfile');
        this.loadUserProfile(this.data.targetOpenid);
      }
    }
  }
}); 
const { createApiClient } = require('../../utils/util');
const baseBehavior = require('../../behaviors/baseBehavior');
const userBehavior = require('../../behaviors/userBehavior');
const { storage } = require('../../utils/util');

// 创建用户API客户端
const userApi = {
  follow: createApiClient('/api/wxapp/user', {}).follow
};

Component({
  behaviors: [baseBehavior, userBehavior],

  properties: {
    user: {
      type: Object,
      value: null
    },
    userInfo: {
      type: Object,
      value: null
    },
    stats: {
      type: Object,
      value: {
        posts: 0,
        likes: 0,
        favorites: 0,
        comments: 0
      }
    },
    isCurrentUser: {
      type: Boolean,
      value: false
    },
    currentUserOpenid: {
      type: String,
      value: ''
    },
    // 加载状态
    loading: {
      type: Boolean,
      value: false
    },
    // 错误状态
    error: {
      type: Boolean,
      value: false
    },
    // 错误信息
    errorMsg: {
      type: String,
      value: ''
    },
    showFollow: {
      type: Boolean,
      value: true
    }
  },

  data: {
    formattedUser: null,
    _lastUpdateTime: null,
    _forceRefresh: null
  },
  
  // 页面显示时检查是否需要刷新
  pageLifetimes: {
    show() {
      if (this.properties.isCurrentUser) {
        // 检查是否需要刷新
        const needRefresh = wx.getStorageSync('needRefreshProfile');
        const updateTimeStr = wx.getStorageSync('profileUpdateTime');
        const updateTime = updateTimeStr ? parseInt(updateTimeStr) : 0;
        
        // 获取上次更新时间
        const lastUpdateTime = this.data._lastUpdateTime || 0;
        
        if (needRefresh || (updateTime && updateTime > lastUpdateTime)) {
          console.debug('用户卡片检测到需要刷新:', needRefresh, updateTime);
          
          // 更新最后刷新时间戳
          this.setData({
            _lastUpdateTime: Date.now()
          });
          
          // 清除标记以避免重复刷新
          wx.removeStorageSync('needRefreshProfile');
          
          // 通知父组件需要刷新数据
          this.triggerEvent('refresh');
          
          // 同时获取最新的本地存储用户信息更新UI
          const localUserInfo = wx.getStorageSync('userInfo');
          if (localUserInfo && this.data.formattedUser) {
            // 更新用户信息显示
            const formattedUser = { ...this.data.formattedUser };
            
            // 更新关键字段
            if (localUserInfo.nickname) formattedUser.nickname = localUserInfo.nickname;
            if (localUserInfo.avatar) formattedUser.avatar = localUserInfo.avatar;
            if (localUserInfo.bio !== undefined) formattedUser.bio = localUserInfo.bio;
            
            // 更新统计数据
            if (localUserInfo.post_count !== undefined) formattedUser.post_count = localUserInfo.post_count;
            if (localUserInfo.like_count !== undefined) formattedUser.like_count = localUserInfo.like_count;
            if (localUserInfo.favorite_count !== undefined) formattedUser.favorite_count = localUserInfo.favorite_count;
            if (localUserInfo.token !== undefined) formattedUser.token = localUserInfo.token;
            
            this.setData({ 
              formattedUser,
              _forceRefresh: Date.now() // 添加强制刷新标记
            });
          }
        }
      }
    }
  },

  observers: {
    'user, userInfo, stats': function(user, userInfo, stats) {
      // 优先使用userInfo属性
      const userData = userInfo && userInfo.openid ? userInfo : user;
      if (userData && userData.openid) {
        this.setData({
          formattedUser: this.formatUser(userData, stats)
        });
      }
    },
    
    // 单独监听userInfo的变化，确保实时更新
    'userInfo.nickname, userInfo.avatar, userInfo.bio': function(nickname, avatar, bio) {
      if (this.data.formattedUser) {
        const formattedUser = { ...this.data.formattedUser };
        
        if (nickname !== undefined) formattedUser.nickname = nickname;
        if (avatar !== undefined) formattedUser.avatar = avatar;
        if (bio !== undefined) formattedUser.bio = bio;
        
        this.setData({ formattedUser });
      }
    }
  },

  methods: {
    // 格式化用户数据
    formatUser(user, stats) {
      if (!user) return null;
      
      const openid = storage.get('openid');
      return {
        ...user,
        nickname: user.nickname || user.nickName || '未知用户',
        avatar: user.avatar || user.avatarUrl || '',  // 设置为空时将使用默认图标
        bio: user.bio || user.signature || '',
        // 合并统计数据
        post_count: stats?.posts || user.post_count || 0,
        like_count: stats?.likes || user.like_count || 0,
        favorite_count: stats?.favorites || user.favorite_count || 0,
        following_count:  stats?.following_count || user.following_count || 0,
        follower_count: stats?.follower_count || user.follower_count || 0,
        token: user.token || 0,
        isFollowed: Array.isArray(user.followers) && user.followers.includes(openid),
        isOwner: user.openid === openid
      };
    },

    // 强制刷新用户数据
    refreshUserData() {
      // 通知父组件需要刷新数据
      this.triggerEvent('refresh');
    },

    // 跳转到用户主页
    onTapUser() {
      if (this.data.isCurrentUser) {
        return;
      }
      
      const { openid } = this.data.formattedUser;
      if (openid) {
        wx.navigateTo({
          url: `/pages/index/user-profile/user-profile?openid=${openid}`,
          fail: (err) => {
            console.error('跳转到用户资料页面失败:', err);
            // 尝试备用路径
            wx.navigateTo({
              url: `/pages/profile/profile?id=${openid}&from=card`,
              fail: (subErr) => {
                console.error('备用路径跳转也失败:', subErr);
              }
            });
          }
        });
      }
    },
    
    // 编辑个人资料
    onEdit() {
      if (!this.data.isCurrentUser) {
        return;
      }
      
      this.triggerEvent('edit');
      wx.navigateTo({
        url: '/pages/profile/edit/edit'
      });
    },
    
    // 关注/取消关注用户
    onFollow() {
      if (this.data.isCurrentUser) {
        return;
      }
      
      const { openid, isFollowed } = this.data.formattedUser;
      if (!openid) return;
      
      if (isFollowed) {
        this.unfollowUser(openid);
      } else {
        this.followUser(openid);
      }
    },
    
    // 关注用户
    async followUser(targetOpenid) {
      try {
        // 使用 userBehavior 中的 _toggleFollow 方法
        const res = await this._toggleFollow({
          followed_id: targetOpenid
        });
        
        if (res && res.code === 200) {
          wx.showToast({
            title: res.data.is_following ? '关注成功' : '已取消关注',
            icon: 'none'
          });
          
          // 更新关注状态
          this.updateFollowStatus(res.data.is_following);
          this.triggerEvent('follow', { user_id: targetOpenid });
        } else {
          wx.showToast({
            title: res?.message || '操作失败',
            icon: 'none'
          });
        }
      } catch (err) {
        console.debug('关注操作失败:', err);
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      }
    },
    
    // 取消关注用户 - 使用同一个方法
    async unfollowUser(targetOpenid) {
      await this.followUser(targetOpenid);
    },
    
    // 更新关注状态
    updateFollowStatus(isFollowed) {
      const formattedUser = { ...this.data.formattedUser };
      formattedUser.isFollowed = isFollowed;
      
      // 更新粉丝计数
      if (formattedUser.follower_count) {
        formattedUser.follower_count = isFollowed 
          ? formattedUser.follower_count + 1 
          : Math.max(0, formattedUser.follower_count - 1);
      }
      
      this.setData({ formattedUser });
    },
    
    // 头像加载错误
    onAvatarError() {
      if (this.data.formattedUser) {
        const formattedUser = {...this.data.formattedUser};
        formattedUser.avatar = '';  // 设置为空，使用name=profile的图标作为默认值
        this.setData({ formattedUser });
      }
    },

    // 重试加载
    onRetry() {
      this.triggerEvent('retry');
    },
    
    // 点击帖子、点赞或收藏跳转到myContent页面
    onTapPosts(e) {
      // 只有当前用户可以点击查看自己的内容
      if (!this.data.isCurrentUser) {
        return;
      }
      
      const tabIndex = e.currentTarget.dataset.tab;
      wx.reLaunch({
        url: `/pages/profile/myContent/myContent?tab=${tabIndex}`
      });
    },
    
    // 点击关注跳转到关注列表页面
    onTapFollowing() {
      if (!this.data.isCurrentUser) {
        return;
      }
      
      wx.reLaunch({
        url: `/pages/profile/myContent/myContent?tab=3`
      });
    },
    
    // 点击粉丝跳转到粉丝列表页面
    onTapFollowers() {
      if (!this.data.isCurrentUser) {
        return;
      }
      
      wx.reLaunch({
        url: `/pages/profile/myContent/myContent?tab=4`
      });
    },
    
    // 点击积分跳转到积分页面
    onTapPoints() {
      // 只有当前用户可以点击查看自己的积分
      if (!this.data.isCurrentUser) {
        return;
      }
      
      wx.reLaunch({
        url: '/pages/profile/points/points'
      });
    },

    // 点击头像或用户名
    onUserTap() {
      const { openid } = this.data.formattedUser;
      if (!openid) return;
      
      wx.navigateTo({
        url: `/pages/index/user-profile/user-profile?openid=${openid}`,
        fail: (err) => {
          console.error('跳转到用户资料页面失败:', err);
          // 尝试备用路径
          wx.navigateTo({
            url: `/pages/profile/profile?id=${openid}&from=card`,
            fail: (subErr) => {
              console.error('备用路径跳转也失败:', subErr);
              wx.redirectTo({
                url: `/pages/profile/profile?id=${openid}&from=card`
              });
            }
          });
        }
      });
    },
    
    // 关注/取消关注
    async onFollowTap() {
      const { openid, isFollowed } = this.data.formattedUser;
      if (!openid) return;
      
      const currentOpenid = storage.get('openid');
      if (!currentOpenid) {
        this.showToast('请先登录', 'error');
        return;
      }
      
      // 不能关注自己
      if (openid === currentOpenid) {
        this.showToast('不能关注自己', 'error');
        return;
      }
      
      try {
        await this._toggleFollow({
          followed_id: openid
        });
      } catch (err) {
        console.error('关注操作失败:', err);
        this.showToast('操作失败', 'error');
      }
    }
  }
}); 
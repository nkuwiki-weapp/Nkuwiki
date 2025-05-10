const { ui, error, formatRelativeTime, storage } = require('../../utils/util');
const baseBehavior = require('../../behaviors/baseBehavior');
const authBehavior = require('../../behaviors/authBehavior');
const userBehavior = require('../../behaviors/userBehavior'); 
const notificationBehavior = require('../../behaviors/notificationBehavior');
const postBehavior = require('../../behaviors/postBehavior');
const commentBehavior = require('../../behaviors/commentBehavior');

// 通知类型配置
const NotificationType = {
  LIKE: 'like',
  COMMENT: 'comment', 
  FOLLOW: 'follow',
  FAVORITE: 'favorite'
};

const NotificationConfig = {
  [NotificationType.LIKE]: {
    icon: 'like',
    action: '点赞了你的',
    targetType: ['post', 'comment']
  },
  [NotificationType.COMMENT]: {
    icon: 'comment',
    action: '评论了你的',
    targetType: ['post']
  },
  [NotificationType.FOLLOW]: {
    icon: 'profile',
    action: '关注了你',
    targetType: ['user']
  },
  [NotificationType.FAVORITE]: {
    icon: 'star',
    action: '收藏了你的',
    targetType: ['post']
  }
};

Page({
  behaviors: [baseBehavior, authBehavior, userBehavior, notificationBehavior, postBehavior, commentBehavior],

  data: {
    activeTab: 0,
    tabs: [
      { title: '未读', type: 'unread' }, 
      { title: '已读', type: 'read' }
    ],
    notifications: [],
    page: 1,
    page_size: 15,
    hasMore: true,
    loading: false,
    error: null,
    NotificationType,
    NotificationConfig,
    navBarHeight: 44  // 默认导航栏高度
  },

  onLoad: async function() {
    try {
      // 获取系统信息，计算导航栏高度
      // const systemInfo = storage.get('systemInfo');
      const navBarHeight = 44;  // 默认导航栏高度
      
      this.setData({
        navBarHeight
      });
      
      // 检查登录状态
      if (!(await this._checkLogin(true))) {
        return;
      }
      
      // 加载通知列表
      await this.loadList();
    } catch (err) {
      this.showToast('加载失败，请重试', 'error');
    }
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList();
    }
  },

  onTabChange(e) {
    const activeTab = e.detail.index;
    this.setData({ 
      activeTab,
      page: 1,
      notifications: [], 
      hasMore: true
    });
    this.loadList(true);
  },

  async loadList(refresh = false) {
    const { activeTab, tabs, page, page_size } = this.data;
    const type = tabs[activeTab].type;

    this.showLoading('加载中...');
    this.setData({ loading: true });

    try {
      const params = {
        is_read: type === 'read' ? 1 : 0,
        page: refresh ? 1 : page,
        page_size
      };
      
      // 使用behavior获取通知列表
      const result = await this._getNotificationList(params);
      
      if (!result) {
        throw new Error('加载失败');
      }
      
      // 格式化通知显示
      const notificationList = Array.isArray(result.data.list) ? result.data.list : [];
      //const notificationList = result.data.list;
      const pagination = result.pagination || {};
      
      const formattedList = notificationList.map(item => ({
        ...item,
        relative_time: formatRelativeTime(item.create_time),
        config: NotificationConfig[item.type] || {}
      }));

      // 加载详情信息
      await this.loadNotificationDetails(formattedList);

      // 更新UI
      this.setData({
        notifications: refresh ? formattedList : [...this.data.notifications, ...formattedList],
        page: refresh ? 2 : page + 1,
        hasMore: pagination.has_more !== undefined ? pagination.has_more : 
          (formattedList.length === page_size)
      });
    } catch (err) {
      this.handleError(err, '加载通知失败');
    } finally {
      this.hideLoading();
      this.setData({ loading: false });
    }
  },

  // 加载通知相关的详情信息
  async loadNotificationDetails(notifications) {
    const postNotifications = notifications.filter(item => 
      item.target_type === 'post' && item.target_id);
    
    const commentNotifications = notifications.filter(item => 
      item.target_type === 'comment' && item.target_id);
    
    // 批量加载帖子详情
    if (postNotifications.length > 0) {
      const uniquePostIds = [...new Set(postNotifications.map(item => item.target_id))];
      
      for (const postId of uniquePostIds) {
        try {
          const postDetail = await this._getPostDetail(postId);
          if (postDetail && postDetail.data) {
            // 为所有相关的通知添加帖子详情
            postNotifications.forEach(notif => {
              if (notif.target_id === postId) {
                notif.targetDetail = {
                  title: postDetail.data.title,
                  content: postDetail.data.content?.substring(0, 50) || '',
                  images: postDetail.data.images
                };
              }
            });
          }
        } catch (err) {
          console.debug(`加载帖子${postId}详情失败:`, err);
        }
      }
    }
    
    // 批量加载评论详情
    if (commentNotifications.length > 0) {
      for (const notification of commentNotifications) {
        try {
          const commentDetail = await this._getCommentDetail(notification.target_id);
          if (commentDetail) {
            notification.targetDetail = {
              content: commentDetail.content?.substring(0, 50) || '',
              post_id: commentDetail.post_id
            };
          }
        } catch (err) {
          console.debug(`加载评论${notification.target_id}详情失败:`, err);
        }
      }
    }
  },

  // 标记所有通知为已读
  async markAllAsRead() {
    if (this.data.activeTab !== 0) return;

    this.showLoading('处理中...');
    
    try {
      // 使用behavior标记所有通知为已读
      if (await this._markAllNotificationsAsRead()) {
        // 成功后刷新列表
        this.setData({
          notifications: [],
          page: 1,
          hasMore: true
        });
        await this.loadList(true);
        this.showToast('已全部标记为已读', 'success');
      } else {
        throw new Error('操作失败');
      }
    } catch (err) {
      this.handleError(err, '操作失败');
    } finally {
      this.hideLoading();
    }
  },

  // 处理通知点击
  async onNotificationTap(e) {
    const { id, type, target_id, target_type, is_read } = e.currentTarget.dataset;
    
    // 标记为已读
    if (!is_read) {
      await this._markNotificationAsRead(id).catch(err => {
      });
    }

    // 跳转到目标页面
    const url = this.getTargetUrl(type, target_id, target_type);
    if (url) {
      this.navigateTo(url);
    }
  },

  // 获取目标URL
  getTargetUrl(type, target_id, target_type) {
    switch (target_type) {
      case 'post':
        return `/pages/post/detail/detail?id=${target_id}${type === NotificationType.COMMENT ? '&focus=comment' : ''}`;
      case 'comment':
        // 如果有评论对应的帖子ID，跳转到帖子详情并定位到评论
        const notification = this.data.notifications.find(n => n.target_id === target_id && n.target_type === 'comment');
        if (notification && notification.targetDetail && notification.targetDetail.post_id) {
          return `/pages/post/detail/detail?id=${notification.targetDetail.post_id}&comment_id=${target_id}`;
        }
        return `/pages/post/detail/detail?id=${target_id}&comment_id=${target_id}`;
      case 'user':
        return `/pages/profile/profile?id=${target_id}`;
      default:
        return '';
    }
  },

  // 删除通知
  async onNotificationDelete(e) {
    const { id } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条通知吗？',
      success: async (res) => {
        if (!res.confirm) return;
        
        this.showLoading('删除中...');
        
        try {
          // 使用behavior删除通知
          if (await this._deleteNotification(id)) {
            // 更新本地列表
            const notifications = this.data.notifications.filter(n => n.id !== id);
            this.setData({ notifications });
            this.showToast('删除成功', 'success');
          } else {
            throw new Error('删除失败');
          }
        } catch (err) {
          this.handleError(err, '删除失败');
        } finally {
          this.hideLoading();
        }
      }
    });
  }
});
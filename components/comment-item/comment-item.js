const baseBehavior = require('../../behaviors/baseBehavior');
const commentBehavior = require('../../behaviors/commentBehavior');
const userBehavior = require('../../behaviors/userBehavior');
const { formatRelativeTime, storage } = require('../../utils/util.js');

Component({
  behaviors: [baseBehavior, commentBehavior, userBehavior],

  options: {
    pureDataPattern: /^_/,
    multipleSlots: true,
    addGlobalClass: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    comment: {
      type: Object,
      value: null
    },
    showActions: {
      type: Boolean,
      value: true
    },
    showFollow: {
      type: Boolean,
      value: true
    },
    detailPage: {
      type: Boolean, 
      value: false
    },
    isCard: {
      type: Boolean,
      value: false
    },
    customStyle: {
      type: String,
      value: ''
    }
  },

  observers: {
    'comment': function(comment) {
      if (!comment || !comment.id) return;
      
      this.setData({
        formattedComment: this.formatComment(comment)
      });
    }
  },

  data: {
    formattedComment: null,
    isProcessing: false,
    _isLiking: false,
    currentUserOpenid: ''
  },

  lifetimes: {
    ready() {
      // 获取当前用户openid
      const openid = storage.get('openid');
      this.setData({ currentUserOpenid: openid });
    }
  },

  methods: {
    // 格式化评论数据
    formatComment(comment) {
      if (!comment) return null;
      
      const openid = storage.get('openid');
      
      // 使用formatRelativeTime处理日期
      let formattedTime = '';
      if (comment.create_time) {
        try {
          formattedTime = formatRelativeTime(comment.create_time);
        } catch (err) {
          console.debug('日期格式化错误:', err);
          formattedTime = '未知时间';
        }
      } else {
        formattedTime = '刚刚';
      }
      
      // 处理图片字段，可能是JSON字符串
      let imageArray = [];
      if (comment.image) {
        try {
          // 如果是字符串，尝试解析JSON
          if (typeof comment.image === 'string') {
            if (comment.image.trim() === '') {
              imageArray = [];
            } else {
              try {
                const parsed = JSON.parse(comment.image);
                imageArray = Array.isArray(parsed) ? parsed : [];
              } catch {
                // 不是有效的JSON，尝试作为单个图片URL处理
                if (comment.image.startsWith('http')) {
                  imageArray = [comment.image];
                }
              }
            }
          }
          // 如果已经是数组，直接使用
          else if (Array.isArray(comment.image)) {
            imageArray = comment.image;
          }
          
          // 过滤掉空字符串或无效URL
          imageArray = imageArray.filter(url => url && typeof url === 'string' && url.trim() !== '');
        } catch (err) {
          console.debug('图片解析错误:', err);
          imageArray = [];
        }
      }
      
      // 确保回复数量正确
      const replyCount = comment.reply_count || 0;
      
      // 处理子评论/回复
      let replies = [];
      if (comment.replies && Array.isArray(comment.replies)) {
        // 处理每个回复的内容
        replies = comment.replies.map(reply => {
          // 处理回复的时间格式化
          let replyFormattedTime = '';
          if (reply.create_time) {
            try {
              replyFormattedTime = formatRelativeTime(reply.create_time);
            } catch (err) {
              replyFormattedTime = '未知时间';
            }
          } else {
            replyFormattedTime = '刚刚';
          }
          
          // 处理回复的图片
          let replyImageArray = [];
          if (reply.image) {
            try {
              if (typeof reply.image === 'string') {
                if (reply.image.trim() === '') {
                  replyImageArray = [];
                } else {
                  try {
                    const parsed = JSON.parse(reply.image);
                    replyImageArray = Array.isArray(parsed) ? parsed : [];
                  } catch {
                    // 不是有效的JSON，尝试作为单个图片URL处理
                    if (reply.image.startsWith('http')) {
                      replyImageArray = [reply.image];
                    }
                  }
                }
              } else if (Array.isArray(reply.image)) {
                replyImageArray = reply.image;
              }
              replyImageArray = replyImageArray.filter(url => url && typeof url === 'string' && url.trim() !== '');
            } catch (err) {
              replyImageArray = [];
            }
          }
          
          // 处理回复的回复对象信息
          let replyTo = null;
          if (reply.reply_to) {
            // 尝试解析reply_to字段
            try {
              // 如果是字符串，尝试解析为JSON
              if (typeof reply.reply_to === 'string') {
                replyTo = JSON.parse(reply.reply_to);
              } 
              // 如果已经是对象
              else if (typeof reply.reply_to === 'object') {
                replyTo = reply.reply_to;
              }
              
              // 确保回复对象具有基本属性
              if (replyTo) {
                // 确保有nickname字段
                if (!replyTo.nickname && reply.parent_nickname) {
                  replyTo.nickname = reply.parent_nickname;
                } else if (!replyTo.nickname) {
                  replyTo.nickname = '用户';
                }
                
                // 确保有id字段（有些旧数据可能使用reply_id）
                if (!replyTo.id && replyTo.reply_id) {
                  replyTo.id = replyTo.reply_id;
                }
                
                // 确保有openid字段
                if (!replyTo.openid && reply.parent_openid) {
                  replyTo.openid = reply.parent_openid;
                }
              }
            } catch (err) {
              console.debug('解析reply_to失败:', err, reply.reply_to);
              
              // 如果解析失败但有父评论信息，创建一个默认的回复对象
              if (reply.parent_nickname || reply.parent_openid) {
                replyTo = {
                  nickname: reply.parent_nickname || '用户',
                  openid: reply.parent_openid || '',
                  id: reply.parent_id || comment.id // 使用父评论ID
                };
              }
            }
          }
          
          // 确保parent_id存在且有效
          let parentId = reply.parent_id;
          if (!parentId && comment.id) {
            // 如果没有parent_id但是在某个评论的replies中，设置parent_id为该评论ID
            parentId = comment.id;
          }
          
          // 返回处理后的回复对象
          return {
            ...reply,
            create_time_formatted: replyFormattedTime,
            image: replyImageArray,
            isOwner: reply.openid === openid,
            reply_to: replyTo,
            parent_id: parentId,
            // 确保回复计数字段
            parent_comment_count: reply.parent_comment_count || 0,
            sub_reply_count: reply.sub_reply_count || 0,
            // 添加子回复数组，如果没有
            sub_replies: reply.sub_replies || []
          };
        });
        
        // 按创建时间倒序排序回复
        replies.sort((a, b) => {
          return new Date(b.create_time) - new Date(a.create_time);
        });
      }
      
      // 返回格式化后的评论对象
      return {
        ...comment,
        create_time_formatted: formattedTime,
        image: imageArray,
        isLiked: comment.is_liked || (Array.isArray(comment.liked_users) && comment.liked_users.includes(openid)),
        isOwner: comment.openid === openid,
        like_count: comment.like_count || (comment.liked_users ? comment.liked_users.length : 0),
        is_following: comment.is_following || false,
        replies: replies,
        reply_count: replyCount
      };
    },
    
    // 点击评论
    onTapComment() {
      const commentId = this.data.formattedComment?.id;
      if (commentId) {
        // 触发评论点击事件
        this.triggerEvent('tap', { commentId });
      }
    },
    
    // 点击头像或用户名
    onTapUser() {
      const openid = this.data.formattedComment?.openid;
      if (!openid) return;
      
      wx.navigateTo({
        url: `/pages/index/user-profile/user-profile?openid=${openid}`,
        fail: (err) => {
          console.error('跳转到用户资料页面失败:', err);
          // 尝试备用路径
          wx.navigateTo({
            url: `/pages/profile/profile?id=${openid}&from=comment`,
            fail: (subErr) => {
              console.error('备用路径跳转也失败:', subErr);
              // 最后尝试redirectTo
              wx.redirectTo({
                url: `/pages/profile/profile?id=${openid}&from=comment`
              });
            }
          });
        }
      });
    },
    
    // 点赞评论
    async onTapLike() {
      const commentId = this.data.formattedComment?.id;
      if (!commentId || this.data._isLiking || this.data.isProcessing) return;
      
      this.setData({ isProcessing: true });
      this.data._isLiking = true;
      
      try {
        const formattedComment = {...this.data.formattedComment};
        const isCurrentlyLiked = formattedComment.isLiked;
        
        // 乐观更新UI
        formattedComment.isLiked = !isCurrentlyLiked;
        formattedComment.like_count = isCurrentlyLiked 
          ? Math.max(0, formattedComment.like_count - 1) 
          : formattedComment.like_count + 1;
        
        this.setData({ formattedComment });
        
        // 调用API，使用commentBehavior中的方法
        const res = await this._likeComment(commentId, !isCurrentlyLiked);
        
        if (res.code !== 200) {
          // 如果失败，恢复原状态
          formattedComment.isLiked = isCurrentlyLiked;
          formattedComment.like_count = isCurrentlyLiked 
            ? formattedComment.like_count + 1 
            : Math.max(0, formattedComment.like_count - 1);
          
          this.setData({ formattedComment });
          throw new Error('点赞失败');
        }
        
        // 触发父组件更新
        this.triggerEvent('like', { 
          id: commentId, 
          isLiked: !isCurrentlyLiked 
        });
      } catch (err) {
        console.debug('点赞评论失败:', err);
      } finally {
        this.setData({ isProcessing: false });
        setTimeout(() => {
          this.data._isLiking = false;
        }, 500);
      }
    },
    
    // 点击回复按钮
    onTapReply() {
      const comment = this.data.formattedComment;
      if (!comment) return;
      
      // 触发回复事件，传递评论ID和昵称
      this.triggerEvent('reply', {
        commentId: comment.id,
        nickname: comment.nickname || '用户',
        openid: comment.openid
      });
    },
    
    // 删除评论
    async onTapDelete() {
      const commentId = this.data.formattedComment?.id;
      if (!commentId || this.data.isProcessing) return;
      
      // 显示确认对话框
      const { confirm } = await wx.showModal({
        title: '提示',
        content: '确定要删除这条评论吗？',
        confirmText: '删除',
        confirmColor: '#ff6b6b'
      });
      
      if (!confirm) return;
      
      this.setData({ isProcessing: true });
      
      try {
        // 调用API
        const res = await this._deleteComment(commentId);
        
        if (res.code === 200) {
          // 触发删除成功事件
          this.triggerEvent('delete', { id: commentId, success: true });
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          });
        } else {
          throw new Error('删除失败');
        }
      } catch (err) {
        console.debug('删除评论失败:', err);
        wx.showToast({
          title: '删除失败',
          icon: 'error'
        });
        // 触发删除失败事件
        this.triggerEvent('delete', { id: commentId, success: false });
      } finally {
        this.setData({ isProcessing: false });
      }
    },

    // 关注用户
    async onTapFollow() {
      const openid = this.data.formattedComment?.openid;
      if (!openid || this.data.isProcessing) return;
      
      this.setData({ isProcessing: true });
      
      try {
        const formattedComment = {...this.data.formattedComment};
        const isCurrentlyFollowing = formattedComment.is_following;
        
        // 乐观更新UI
        formattedComment.is_following = !isCurrentlyFollowing;
        this.setData({ formattedComment });
        
        // 调用API，使用userBehavior中的方法
        const res = await this._followUser(openid, !isCurrentlyFollowing);
        
        if (res.code !== 200) {
          // 如果失败，恢复原状态
          formattedComment.is_following = isCurrentlyFollowing;
          this.setData({ formattedComment });
          throw new Error('关注操作失败');
        }
        
        // 触发父组件更新
        this.triggerEvent('follow', { 
          openid: openid, 
          isFollowing: !isCurrentlyFollowing 
        });
      } catch (err) {
        console.debug('关注操作失败:', err);
        wx.showToast({
          title: '操作失败',
          icon: 'error'
        });
      } finally {
        this.setData({ isProcessing: false });
      }
    },
    
    // 预览图片
    onPreviewImage(e) {
      const { current } = e.currentTarget.dataset;
      const { image } = this.data.formattedComment;
      
      if (image && image.length > 0) {
        wx.previewImage({
          current,
          urls: image
        });
      }
    },
    
    // 头像加载失败
    onAvatarError() {
      const formattedComment = { ...this.data.formattedComment };
      formattedComment.avatar = ''; // 清空头像，让组件使用默认icon
      this.setData({ formattedComment });
    },
    
    // 回复预览图片
    onPreviewReplyImage(e) {
      const { current, urls } = e.currentTarget.dataset;
      if (urls && urls.length > 0) {
        wx.previewImage({
          current,
          urls
        });
      }
    },
    
    // 查看更多回复
    viewMoreReplies() {
      const comment = this.data.formattedComment;
      if (!comment || !comment.id) return;
      
      // 通知父组件加载更多回复
      this.triggerEvent('viewReplies', {
        commentId: comment.id,
        currentReplyCount: comment.replies ? comment.replies.length : 0,
        totalReplyCount: comment.reply_count || 0
      });
    },
    
    // 点击回复中的用户
    onTapReplyUser(e) {
      const { openid } = e.currentTarget.dataset;
      if (!openid) return;
      
      // 将openid存入缓存，防止URL参数失效时作为备用
      storage.set('temp_profile_openid', openid);
      
      // 跳转到用户主页
      wx.reLaunch({
        url: `/pages/profile/profile?openid=${openid}`,
        fail: (err) => {
          console.debug('跳转到个人主页失败:', err);
        }
      });
    },
    
    // 查看更多子回复
    viewMoreSubReplies(e) {
      const { replyId } = e.currentTarget.dataset;
      if (!replyId) return;
      
      const comment = this.data.formattedComment;
      if (!comment || !comment.id) return;
      
      // 查找具体回复
      const reply = comment.replies.find(r => r.id === replyId);
      if (!reply) return;
      
      // 通知父组件加载更多子回复
      this.triggerEvent('viewSubReplies', {
        commentId: comment.id,
        replyId: replyId,
        currentCount: reply.sub_replies ? reply.sub_replies.length : 0,
        totalCount: reply.sub_reply_count || 0
      });
    },
    
    // 回复回复
    onTapReplyToReply(e) {
      const { dataset } = e.currentTarget;
      const replyComment = dataset.comment;
      if (!replyComment) return;
      
      const parentComment = this.data.formattedComment;
      if (!parentComment) return;
      
      // 触发回复回复事件，传递完整参数
      this.triggerEvent('replyToReply', {
        comment: replyComment,  // 被回复的回复
        parentId: parentComment.id,  // 父评论ID
        replyTo: {
          id: replyComment.id,
          nickname: replyComment.nickname || '用户',
          openid: replyComment.openid
        }
      });
    },
    
    // 删除回复
    async onTapDeleteReply(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      
      // 显示确认对话框
      const { confirm } = await wx.showModal({
        title: '提示',
        content: '确定要删除这条回复吗？',
        confirmText: '删除',
        confirmColor: '#ff6b6b'
      });
      
      if (!confirm) return;
      
      // 触发删除回复事件
      this.triggerEvent('deleteReply', { 
        commentId: this.data.formattedComment?.id,
        replyId: id 
      });
    },
    
    // 处理回复头像加载错误
    onReplyAvatarError(e) {
      console.debug('回复头像加载失败:', e);
    },
  }
}); 
const behaviors = require('../../behaviors/index');
const { storage } = require('../../utils/util');

Component({
  behaviors: [
    behaviors.baseBehavior,
    behaviors.commentBehavior,
    behaviors.authBehavior
  ],
  
  properties: {
    // 帖子ID
    postId: {
      type: null,
      value: 0,
      observer: function(newVal) {
        if (newVal) {
          this.loadComments();
        }
      }
    },
    // 是否允许回复
    allowReply: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    // 评论数据
    comments: [],
    
    // 基础状态
    loading: false,
    error: false,
    errorMsg: '加载评论失败',
    
    // 分页状态
    page: 1,
    pageSize: 10,
    total: 0,
    hasMore: false,
    
    // 评论输入相关
    commentText: '',
    commentFocus: false,
    replyTo: null,
    isSubmitting: false,
    
    // 当前用户信息
    currentUserOpenid: ''
  },

  lifetimes: {
    attached() {
      // 自动获取当前用户openid
      const openid = this.getStorage('openid');
      
      if (openid) {
        this.setData({ currentUserOpenid: openid });
      }
      
      // 如果提供了postId，自动加载评论
      if (this.properties.postId) {
        this.loadComments();
      }
    },

    ready() {
      // 打印调试日志，用于检查组件状态
      console.debug('评论组件就绪，初始输入内容:', this.data.commentText);
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 加载评论
    loadComments() {
      const postId = Number(this.properties.postId);
      const { page, pageSize } = this.data;
      
      if (!postId) {
        return Promise.reject(new Error('未提供帖子ID'));
      }
      
      this.setData({ loading: true, error: false, errorMsg: '' });
      
      return this._getCommentList(postId, { page, limit: pageSize })
        .then(result => {
          if (result) {
            const { list: comments, total, has_more } = result;
            
            // 将API返回的扁平评论列表转换为树状结构
            const commentList = buildCommentTree(comments);
            
            // 更新评论列表和分页信息，只使用顶级评论
            this.setData({
              comments: this.data.page === 1 ? commentList : [...this.data.comments, ...commentList],
              hasMore: has_more,
              total: total || 0
            });

            // 如果是首次加载，为有回复的评论预加载部分回复
            if (this.data.page === 1) {
              this.preloadReplies(commentList);
            }
          } else {
            throw new Error('获取评论失败');
          }
        })
        .catch(error => {
          this.setData({ error: true, errorMsg: error.message || '加载评论失败' });
          return Promise.reject(error);
        })
        .finally(() => {
          this.setData({ loading: false });
        });
    },
    
    // 预加载评论回复
    preloadReplies(comments) {
      if (!comments || !Array.isArray(comments)) return;

      comments.forEach(comment => {
        // 如果评论没有回复但reply_count > 0，加载前几条回复
        if ((!comment.replies || comment.replies.length === 0) && comment.reply_count > 0) {
          // 获取该评论的所有回复
          this._getCommentList(this.properties.postId, {
            parentId: comment.id,
            page: 1,
            page_size: 5
          })
          .then(result => {
            if (result && result.list && result.list.length > 0) {
              // 更新评论的回复列表
              const comments = [...this.data.comments];
              const idx = comments.findIndex(c => c.id === comment.id);
              if (idx !== -1) {
                comments[idx].replies = result.list;
                comments[idx].reply_count = result.total || comments[idx].reply_count;
                this.setData({ comments });
                console.debug(`为评论${comment.id}加载了${result.list.length}条回复`);
              }
            }
          })
          .catch(err => {
            console.debug(`加载评论${comment.id}的回复失败:`, err);
          });
        }
      });
    },

    // 加载评论回复
    loadCommentReplies(commentId, page = 1, pageSize = 5) {
      if (!commentId) return Promise.reject(new Error('缺少评论ID'));

      const postId = Number(this.properties.postId);

      return this._getCommentList(postId, {
        parentId: commentId,
        page,
        page_size: pageSize
      })
      .then(result => {
        if (result && result.list) {
          // 更新对应评论的回复列表
          const comments = [...this.data.comments];
          const commentIndex = comments.findIndex(c => c.id == commentId);

          if (commentIndex !== -1) {
            // 如果找到评论，更新其回复
            const comment = comments[commentIndex];
            comment.replies = page === 1 ? result.list : [...(comment.replies || []), ...result.list];
            comment.reply_count = result.total || comment.reply_count || 0;

            this.setData({ comments });
          }

          return result;
        }
        return null;
      })
      .catch(err => {
        console.debug('加载回复失败:', err);
        return null;
      });
    },

    // 重置分页
    resetPagination() {
      this.setData({
        page: 1,
        hasMore: true,
        total: 0
      });
    },
    
    // 刷新评论列表
    refresh() {
      this.resetPagination();
      this.setData({ comments: [] }, () => {
        this.loadComments();
      });
    },
    
    // 重试加载评论
    retry() {
      this.loadComments();
      this.triggerEvent('retry');
    },

    // 加载更多评论
    loadMore() {
      if (this.data.loading || !this.data.hasMore) return;
      
      this.setData({ page: this.data.page + 1 }, () => {
        this.loadComments();
      });
      
      this.triggerEvent('loadmore');
    },
    
    // 定位到指定评论
    locateComment(commentId) {
      if (!commentId) return;
      
      // 在当前评论列表中查找指定评论
      const targetIndex = this.data.comments.findIndex(comment => comment.id == commentId);
      
      if (targetIndex >= 0) {
        // 如果找到评论，滚动到该评论位置
        this.highlightAndScrollToComment(targetIndex);
      } else {
        // 如果没找到，可能在后续页，先重置列表然后加载所有评论直到找到指定评论
        this.loadCommentUntilFound(commentId);
      }
    },
    
    // 高亮并滚动到指定评论
    highlightAndScrollToComment(index) {
      // 临时添加高亮类
      const comments = [...this.data.comments];
      comments[index] = { ...comments[index], highlighted: true };
      
      this.setData({ comments }, () => {
        // 使用选择器查询评论元素位置
        const query = this.createSelectorQuery();
        query.select(`.comment-item-${comments[index].id}`).boundingClientRect();
        query.selectViewport().scrollOffset();
        query.exec(res => {
          if (res && res[0]) {
            const commentElem = res[0];
            const scrollTop = res[1].scrollTop;
            
            // 计算目标滚动位置，留一些顶部空间
            const targetScrollTop = commentElem.top + scrollTop - 100;
            
            // 滚动到指定位置
            wx.pageScrollTo({
              scrollTop: targetScrollTop,
              duration: 300
            });
            
            // 添加高亮效果
            wx.createSelectorQuery()
              .select(`.comment-item-${comments[index].id}`)
              .fields({ node: true, size: true }, function (res) {
                if (res && res.node) {
                  res.node.addClass('highlighted');
                  // 3秒后移除高亮
                  setTimeout(() => {
                    res.node.removeClass('highlighted');
                  }, 3000);
                }
              })
              .exec();
          }
        });
      });
    },
    
    // 逐页加载直到找到指定评论
    loadCommentUntilFound(commentId) {
      // 重置分页并重新加载
      this.resetPagination();
      
      // 递归函数，不断加载更多直到找到评论
      const loadAndFind = () => {
        this.loadComments().then(() => {
          // 检查是否找到评论
          const index = this.data.comments.findIndex(c => c.id == commentId);
          
          if (index >= 0) {
            // 找到了，高亮并滚动到指定位置
            this.highlightAndScrollToComment(index);
          } else if (this.data.hasMore) {
            // 还有更多评论，继续加载
            this.setData({ page: this.data.page + 1 }, () => {
              loadAndFind();
            });
          } else {
            // 加载完所有评论仍未找到
            this.showToast('未找到指定评论', 'error');
          }
        }).catch(() => {
          this.showToast('加载评论失败', 'error');
        });
      };
      
      loadAndFind();
    },
    
    // 处理回复评论
    handleReply(e) {
      if (this.data.isSubmitting) return;
      
      const { commentId, nickname, openid } = e.detail;
      if (!commentId) return;

      const comment = this.data.comments.find(c => c.id === commentId);
      if (!comment) return;
      
      this.setData({
        replyToComment: comment,
        replyToReply: null,
        commentFocus: true
      });

      // 触发事件，以便页面可以滚动到评论框
      this.triggerEvent('focusComment', { commentId });
    },
    
    // 处理回复的回复
    handleReplyToReply(e) {
      if (this.data.isSubmitting) return;
      
      const { comment, parentId, replyTo } = e.detail;
      if (!comment || !comment.id) return;
      
      // 查找父评论
      const parentComment = this.data.comments.find(c => c.id === parentId);
      if (!parentComment) return;

      this.setData({
        replyToComment: parentComment,
        replyToReply: replyTo || {
          id: comment.id,
          nickname: comment.nickname || '用户',
          openid: comment.openid
        },
        commentFocus: true
      });

      // 触发事件，以便页面可以滚动到评论框
      this.triggerEvent('focusComment', { commentId: parentId, replyId: comment.id });
    },
    
    // 处理删除评论
    handleDelete(e) {
      const { id } = e.detail;
      
      // 找到要删除的评论所在位置
      const index = this.data.comments.findIndex(comment => comment.id == id);
      if (index === -1) return;
      
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这条评论吗？',
        confirmText: '删除',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            // 先移除本地数据再发起请求
            const newComments = [...this.data.comments];
            newComments.splice(index, 1);
            
            this.setData({ 
              comments: newComments,
              total: Math.max(0, this.data.total - 1)
            });
            
            // 发起删除请求
            this._deleteComment(id)
              .then(() => {
                this.showToast('删除成功', 'success');
                
                // 通知父组件更新评论计数
                this.triggerEvent('commentDeleted', {
                  postId: this.properties.postId,
                  commentId: id
                });
              })
              .catch(err => {
                console.error('删除评论失败:', err);
                this.showToast('删除失败，请稍后重试', 'error');
                
                // 恢复删除的评论
                this.refresh();
              });
          }
        }
      });
    },
    
    // 处理删除回复
    handleDeleteReply(e) {
      const { commentId, replyId } = e.detail;

      // 找到要删除的评论和回复
      const commentIndex = this.data.comments.findIndex(comment => comment.id == commentId);
      if (commentIndex === -1) return;

      const comment = this.data.comments[commentIndex];
      const replyIndex = comment.replies?.findIndex(reply => reply.id == replyId);
      if (replyIndex === -1 || replyIndex === undefined) return;

      wx.showModal({
        title: '确认删除',
        content: '确定要删除这条回复吗？',
        confirmText: '删除',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            // 先在UI上移除
            const newComments = [...this.data.comments];
            const replies = [...newComments[commentIndex].replies];
            replies.splice(replyIndex, 1);

            newComments[commentIndex].replies = replies;
            newComments[commentIndex].reply_count = Math.max(0, newComments[commentIndex].reply_count - 1);

            this.setData({ comments: newComments });

            // 调用API删除
            this._deleteComment(replyId)
              .then(() => {
                this.showToast('删除成功', 'success');
              })
              .catch(err => {
                console.debug('删除回复失败:', err);
                this.showToast('删除失败，请稍后重试', 'error');
                // 恢复删除的回复，重新加载评论
                this.refresh();
              });
          }
        }
      });
    },

    // 查看更多回复
    viewMoreReplies(e) {
      const { commentId } = e.currentTarget.dataset;
      this.triggerEvent('viewreplies', { commentId });
    },
    
    // 处理用户点击
    goToUserProfile(e) {
      const { userId } = e.detail;
      if (!userId) return;
      
      wx.navigateTo({
        url: `/pages/profile/profile?id=${userId}`,
        fail: () => {
          this.setStorage('temp_profile_id', userId);
          wx.switchTab({
            url: `/pages/profile/profile`
          });
        }
      });
    },
    
    // 预览评论图片
    previewCommentImage(e) {
      const { urls, current } = e.currentTarget.dataset;
      wx.previewImage({
        urls,
        current
      });
    },
    
    // 处理图片加载错误
    handleImageError(e) {
      const { urls, current } = e.currentTarget.dataset;
      console.debug('评论图片加载出错:', e);
      
      // 可以在这里设置默认图片或者其他处理逻辑
      // 例如替换为默认图片
      if (e.type === 'error') {
        // 可以在这里更新数据中的图片URL为默认图片
        // 但是要注意不要频繁更新，避免死循环
      }
    },
    
    // 阻止冒泡
    stopPropagation() {
      // 阻止事件冒泡
    },
    
    // 评论输入事件
    onCommentInput(e) {
      const value = e.detail.value;
      console.debug('评论内容变化:', value);
      this.setData({
        commentText: e.detail.value.trimStart()
      });
    },
    
    // 评论获取焦点
    onCommentFocus() {
      // 检查用户登录
      this._checkLogin();
    },
    
    // 清除评论内容
    clearComment() {
      this.setData({
        commentText: '',
        replyTo: null
      });
    },
    
    // 取消回复
    cancelReply() {
      this.setData({
        commentText: '',
        replyToComment: null,
        replyToReply: null,
        commentFocus: false
      });
    },
    
    // 提交评论
    async submitComment() {
      // 检查评论内容是否为空
      const content = this.data.commentText?.trim();
      if (!content) {
        this.showToast('评论内容不能为空', 'error');
        return;
      }
      
      // 检查用户是否登录
      const openid = storage.get('openid');
      if (!openid) {
        this.showToast('请先登录', 'error');
        this.triggerEvent('needLogin');
        return;
      }
      
      // 准备参数
      const postId = this.properties.postId;
      const parentId = this.data.replyToComment?.id || null;
      const replyToInfo = parentId && this.data.replyToReply ? {
        id: this.data.replyToReply.id,
        nickname: this.data.replyToReply.nickname,
        openid: this.data.replyToReply.openid
      } : null;

      // 显示提交中状态
      this.setData({ isSubmitting: true });
      wx.showLoading({ title: '发送中...' });
      
      try {
        // 调用API创建评论
        const result = await this._createComment(postId, content, parentId, replyToInfo);

        if (result.code === 200) {
          // 清空输入
          this.setData({
            commentText: '',
            replyToComment: null,
            replyToReply: null,
            commentFocus: false
          });
          
          wx.hideLoading();
          this.showToast('评论成功', 'success');

          // 获取用户信息
          const userInfo = await this._getUserInfo(openid);

          if (userInfo.code === 200 && userInfo.data) {
            const { nickname, avatar, bio } = userInfo.data;

            // 构建新评论对象
            const newComment = {
              id: result.data.id,
              post_id: postId,
              parent_id: parentId,
              openid,
              content,
              image: '[]',
              create_time: new Date().toISOString(),
              nickname,
              avatar,
              bio,
              like_count: 0,
              reply_count: 0,
              is_liked: false,
              isOwner: true,
              replies: []
            };

            // 如果是回复某个评论
            if (parentId) {
              // 查找父评论
              const commentIndex = this.data.comments.findIndex(c => c.id === parentId);

              if (commentIndex !== -1) {
                // 克隆评论列表和父评论
                const comments = [...this.data.comments];
                const parentComment = {...comments[commentIndex]};

                // 确保父评论有回复数组
                if (!parentComment.replies) {
                  parentComment.replies = [];
                }

                // 处理回复信息
                if (replyToInfo) {
                  // 如果是回复其他回复
                  newComment.reply_to = JSON.stringify(replyToInfo);

                  // 打印调试信息
                  console.debug('回复其他回复:', replyToInfo);
                }

                // 将新回复添加到父评论的回复列表开头
                parentComment.replies.unshift(newComment);

                // 更新父评论的回复计数
                parentComment.reply_count = (parentComment.reply_count || 0) + 1;

                // 如果回复数量超过显示限制，保留最新的几条
                const maxDisplayReplies = 5;
                if (parentComment.replies.length > maxDisplayReplies) {
                  parentComment.replies = parentComment.replies.slice(0, maxDisplayReplies);
                }

                // 更新评论列表
                comments[commentIndex] = parentComment;
                this.setData({ comments });

                // 触发回复添加事件
                this.triggerEvent('replyAdded', {
                  postId,
                  parentId,
                  comment: newComment
                });
              } else {
                // 在当前列表中找不到父评论，刷新整个列表
                this.refresh();

                // 触发回复添加事件
                this.triggerEvent('replyAdded', {
                  postId,
                  parentId,
                  comment: newComment
                });
              }
            } else {
              // 顶级评论，直接添加到列表头部
              this.setData({
                comments: [newComment, ...this.data.comments],
                total: this.data.total + 1
              });

              // 触发评论添加事件
              this.triggerEvent('commentAdded', {
                postId,
                comment: newComment
              });
            }
          } else {
            // 用户信息获取失败或者API返回格式不完整，刷新列表
            console.debug('用户信息获取失败，刷新列表');
            this.refresh();
          }
        } else {
          wx.hideLoading();
          throw new Error(result.message || '评论提交失败');
        }
      } catch (err) {
        wx.hideLoading();
        console.debug('提交评论出错:', err);
        this.showToast('评论提交失败，请重试', 'error');
      } finally {
        this.setData({ isSubmitting: false });
      }
    },

    // 查看单条评论的所有回复
    handleViewReplies(e) {
      const { commentId } = e.detail;
      if (!commentId) return;

      // 查找评论
      const commentIndex = this.data.comments.findIndex(c => c.id == commentId);
      if (commentIndex === -1) return;

      const comment = this.data.comments[commentIndex];

      // 显示加载中状态
      wx.showLoading({
        title: '加载回复中',
        mask: true
      });

      // 加载该评论的所有回复
      this._getCommentList(this.properties.postId, {
        parentId: commentId,
        page: 1,
        page_size: 50 // 一次加载足够多的回复
      })
      .then(result => {
        wx.hideLoading();

        if (result && result.list && result.list.length > 0) {
          // 更新评论回复列表
          const comments = [...this.data.comments];
          comments[commentIndex].replies = result.list;
          comments[commentIndex].reply_count = result.total || comments[commentIndex].reply_count;

          this.setData({ comments });
          this.showToast(`已加载${result.list.length}条回复`, 'success');
        } else {
          this.showToast('暂无回复', 'none');
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.debug('加载回复失败:', err);
        this.showToast('加载回复失败', 'error');
      });
    },

    // 添加处理查看子回复的方法
    handleViewSubReplies(e) {
      const { commentId, replyId } = e.detail;

      // 获取特定回复的子回复
      this.loadSubReplies(commentId, replyId);
    },

    // 加载子回复
    loadSubReplies(commentId, replyId, page = 1, pageSize = 10) {
      if (!commentId || !replyId) return Promise.reject(new Error('参数缺失'));

      const postId = Number(this.properties.postId);

      // 查询子回复需要传递parent_id为回复ID
      return this._getCommentList(postId, {
        parentId: replyId,
        page,
        page_size: pageSize
      })
      .then(result => {
        if (result && result.list) {
          // 更新对应评论的子回复
          const comments = [...this.data.comments];
          const commentIndex = comments.findIndex(c => c.id == commentId);

          if (commentIndex !== -1) {
            const comment = comments[commentIndex];
            const replyIndex = comment.replies?.findIndex(r => r.id == replyId);

            if (replyIndex !== -1 && replyIndex !== undefined) {
              const reply = comment.replies[replyIndex];

              // 更新子回复
              reply.sub_replies = page === 1 ? result.list : [...(reply.sub_replies || []), ...result.list];
              reply.sub_reply_count = result.total || reply.sub_reply_count || 0;

              this.setData({ comments });
            }
          }

          return result;
        }
        return null;
      })
      .catch(err => {
        console.debug('加载子回复失败:', err);
        return null;
      });
    }
  }
})

// 将API返回的扁平评论列表转换为树状结构
function buildCommentTree(commentList) {
  if (!commentList || !Array.isArray(commentList)) return [];

  console.debug('接收到评论列表:', commentList.length);

  // 创建评论映射
  const commentMap = {};

  // 第一步：将所有评论保存到映射
  commentList.forEach(comment => {
    // 确保评论对象有基本属性
    if (!comment.replies) {
      comment.replies = [];
    }

    // 重新计算回复数量（如果需要）
    comment.reply_count = comment.reply_count || 0;

    // 将评论加入映射表
    commentMap[comment.id] = comment;
  });

  // 第二步：分离顶级评论和回复评论
  const topComments = [];
  const replyComments = [];

  // 先将所有评论分类
  commentList.forEach(comment => {
    if (comment.parent_id === null) {
      // 顶级评论
      topComments.push(comment);
    } else {
      // 回复评论
      replyComments.push(comment);
      comment.is_reply = true;
    }
  });

  console.debug('顶级评论数量:', topComments.length);
  console.debug('回复评论数量:', replyComments.length);

  // 第三步：为避免二次遍历出现的问题，先清空所有已添加的回复
  topComments.forEach(comment => {
    comment.replies = [];
    comment.reply_count = 0;
  });

  // 第四步：组织回复关系
  replyComments.forEach(reply => {
    const parentId = reply.parent_id;
    const parentComment = commentMap[parentId];

    if (parentComment) {
      // 将回复添加到父评论的replies数组
      parentComment.replies.push(reply);

      // 标记为回复
      reply.is_reply = true;

      // 更新父评论的回复计数
      parentComment.reply_count += 1;
    } else {
      // 找不到父评论，可能是被删除了或者数据不完整
      // 将此回复作为顶级评论处理
      console.debug('找不到父评论:', parentId, '将回复作为顶级评论处理');
      reply.parent_id = null;
      reply.is_orphan_reply = true; // 标记为孤立回复
      topComments.push(reply);
    }
  });

  // 第五步：对每个评论的回复列表按时间排序
  Object.values(commentMap).forEach(comment => {
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.sort((a, b) => {
        return new Date(b.create_time) - new Date(a.create_time);
      });
    }
  });

  // 第六步：对顶级评论按时间排序并返回
  topComments.sort((a, b) => {
    return new Date(b.create_time) - new Date(a.create_time);
  });

  // 打印调试信息
  topComments.forEach((comment, index) => {
    console.debug(`顶级评论${index+1}: id=${comment.id}, 回复数=${comment.replies.length}/${comment.reply_count}`);
  });

  return topComments;
}
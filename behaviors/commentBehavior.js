/**
 * 评论行为 - 处理评论列表加载、发布、删除、回复等
 */
const { storage, createApiClient } = require('../utils/util');

// 创建评论API客户端
const commentApi = createApiClient('/api/wxapp/comment', {
  list:   { method: 'GET',  path: '/list',   params: { openid: true, post_id: true } }, // Required: post_id
  detail: { method: 'GET',  path: '/detail', params: { openid: true, comment_id: true } },
  create: { method: 'POST', path: '',        params: { openid: true, post_id: true, content: true } }, // Required: post_id, content
  delete: { method: 'POST', path: '/delete', params: { openid: true, comment_id: true } },
  like:   { method: 'POST', path: '/like',   params: { openid: true, comment_id: true } }
});

module.exports = Behavior({
  methods: {
    /**
     * 获取评论列表
     * @param {number} postId - 帖子ID
     * @param {object} [options={}] - 可选参数
     * @param {string} [options.parentId] - 父评论ID，获取回复列表时使用
     * @param {number} [options.page=1] - 页码
     * @param {number} [options.page_size=20] - 每页数量
     * @returns {Promise<Object|null>} 评论列表和分页信息
     */
    async _getCommentList(postId, options = {}) {
      if (!postId) return null;
      
      const { parentId, page = 1, page_size = 20, limit } = options;

      const openid = storage.get('openid');
      const params = { 
        post_id: Number(postId), // 确保 post_id 是数字类型
        parent_id: parentId, 
        page, 
        page_size: page_size || limit || 20,  // 优先使用page_size，兼容旧的limit参数
        openid 
      };

      try {
        const res = await commentApi.list(params);
        if (res.code !== 200) throw new Error(res.message || '获取评论列表失败');
        
        // 适配新API响应格式
        return {
          list: res.data || [],  // 评论数据直接在data中
          total: res.pagination?.total || 0,
          page: res.pagination?.page || page,
          page_size: res.pagination?.page_size || params.page_size,
          has_more: res.pagination?.has_more || false
        };
      } catch (err) {
        return null;
      }
    },

    /**
     * 获取单条评论详情
     * @param {string} commentId - 评论ID
     * @returns {Promise<object|null>} 评论详情
     */
    async _getCommentDetail(commentId) {
      if (!commentId) return null;
      
      try {
        const res = await commentApi.detail({ 
          comment_id: commentId, 
          openid: storage.get('openid') 
        });
        
        if (res.code !== 200) throw new Error(res.message || '获取评论详情失败');
        return res.data;
      } catch (err) {
        return null;
      }
    },

    /**
     * 创建评论或回复
     * @param {string} postId - 帖子ID
     * @param {string} content - 评论内容
     * @param {string} [parentId] - 父评论ID，回复时使用
     * @param {object} [replyTo] - 回复对象信息，回复的回复时使用
     * @returns {Promise<object|null>} 创建的评论
     */
    async _createComment(postId, content, parentId = null, replyTo = null) {
      if (!postId) return null;
      if (!content?.trim()) return null;
      
      const openid = storage.get('openid');
      if (!openid) return null;

      try {
        const params = { 
          post_id: postId, 
          content: content.trim(), 
          parent_id: parentId, 
          openid 
        };
        
        // 如果是回复的回复，添加回复对象信息
        if (replyTo) {
          params.reply_to = JSON.stringify(replyTo);
        }
        
        const res = await commentApi.create(params);
        
        if (res.code !== 200) {
          throw new Error(res.message || '评论失败');
        }
        
        // 处理新的响应格式，从details中获取comment_id
        if (res.details?.comment_id) {
          // 如果details中有comment_id，创建一个简单的评论对象返回
          const newComment = {
            id: res.details.comment_id,
            post_id: postId,
            content: content.trim(),
            parent_id: parentId,
            openid,
            // 添加创建时间
            create_time: new Date().toISOString()
          };
          
          // 如果有回复对象信息，添加到返回值中
          if (replyTo) {
            newComment.reply_to = {
              id: replyTo.reply_id,
              nickname: replyTo.nickname,
              openid: replyTo.openid
            };
          }
          
          return newComment;
        } else if (res.data) {
          // 兼容旧格式，如果data中有完整评论数据
          return res.data;
        }
        
        throw new Error('评论创建成功但未返回评论数据');
      } catch (err) {
        return null;
      }
    },

    /**
     * 删除评论
     * @param {string} commentId - 评论ID
     * @returns {Promise<boolean>} 是否删除成功
     */
    async _deleteComment(commentId) {
      if (!commentId) {
        return false;
      }
      
      const openid = storage.get('openid');
      if (!openid) {
        return false;
      }

      try {
        const params = { 
          comment_id: Number(commentId), // 确保转换为数字
          openid 
        };
        
        const res = await commentApi.delete(params);
        
        if (res.code !== 200) throw new Error(res.message || '删除评论失败');
        return true;
      } catch (err) {
        return false;
      }
    },

    /**
     * 点赞/取消点赞评论
     * @param {string} commentId - 评论ID
     * @returns {Promise<{status: string, like_count: number}|null>} 点赞结果
     */
    async _toggleCommentLike(commentId) {
      if (!commentId) return null;
      
      const openid = storage.get('openid');
      if (!openid) return null;

      try {
        const res = await commentApi.like({ 
          comment_id: commentId, 
          openid 
        });
        
        if (res.code !== 200 || !res.data) throw new Error(res.message || '操作失败');
        return res.data;
      } catch (err) {
        return null;
      }
    }
  }
}); 
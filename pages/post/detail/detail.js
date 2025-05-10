const behaviors = require('../../../behaviors/index');

Page({
  behaviors: [
    behaviors.baseBehavior,
    behaviors.authBehavior, 
    behaviors.userBehavior,
    behaviors.postBehavior
  ],

  data: {
    statusBarHeight: 0,
    isPostLoading: true,
    loadError: '',
    postDetail: null,
    postId: '',
    commentId: '',
  
    // 顶部提示
    toptips: {
      show: false,
      msg: '',
      type: 'error'
    },
    
    // 对话框
    dialog: {
      show: false,
      title: '',
      buttons: []
    }
  },

  async onLoad(options) {
    // 从页面参数中获取帖子ID
    const postId = options.id;
    this.setData({
      postId: postId
    });
    if(options.commentId){
      this.setData({
        commentId: options.commentId
      });
    }
    
    try {
      const windowInfo = wx.getWindowInfo();
      this.setData({
        statusBarHeight: windowInfo.statusBarHeight,
      });
    } catch (err) {
      this.setData({
        statusBarHeight: 20, // 默认状态栏高度
      });
    }
    
    // 加载帖子详情
    await this.loadPostDetail();
  },
  
  onReady() {
    // 如果有评论ID参数，等待页面准备好后定位到指定评论
    const { commentId } = this.data;
    if (commentId) {
      // 给评论列表一些时间加载数据
      setTimeout(() => {
        this.scrollToComment(commentId);
      }, 1000);
    }
  },
  
  onShow() {

  },


  
  // 显示顶部提示
  showToptips(msg, type = 'error') {
    this.setData({
      'toptips.show': true,
      'toptips.msg': msg,
      'toptips.type': type
    });
    
    setTimeout(() => {
      this.setData({ 'toptips.show': false });
    }, 3000);
  },
  
  // 下拉刷新
  onPullDownRefresh() {
    // 重新加载帖子详情
    this.loadPostDetail();
    
    // 获取评论列表组件实例，刷新评论列表
    const commentList = this.selectComponent('#commentList');
    if (commentList) {
      commentList.refresh();
    }
    
    // 停止下拉刷新
    wx.stopPullDownRefresh();
  },
  
  // 帖子删除回调
  onPostDeleted() {
    // 显示成功提示
    this.showToptips('帖子已删除', 'success');
    
    // 延迟返回
    setTimeout(() => {
      this.navigateBack();
    }, 1500);
  },
  
  // 获取页面状态组件实例
  getPageStatus() {
    return this.selectComponent('#pageStatus');
  },
  
  // 显示全屏加载
  showFullscreenLoading(text = '加载中...') {
    const pageStatus = this.getPageStatus();
    if (pageStatus) {
      pageStatus.showLoading({
        text,
        type: 'fullscreen',
        mask: true
      });
    }
  },
  
  // 隐藏全屏加载
  hideFullscreenLoading() {
    const pageStatus = this.getPageStatus();
    if (pageStatus) {
      pageStatus.hideLoading();
    }
  },
  
  // 显示错误状态
  showError(message) {
    const pageStatus = this.getPageStatus();
    if (pageStatus) {
      pageStatus.showError(message);
    }
  },

  // 滚动到指定评论的方法
  scrollToComment(commentId) {
    // 获取评论列表组件实例
    const commentList = this.selectComponent('#commentList');
    if (commentList) {
      // 调用评论列表组件的方法，定位到指定评论
      commentList.locateComment(commentId);
    }
  },

  // 加载帖子详情
  async loadPostDetail() {
    const { postId } = this.data;
    if (!postId) {
      this.setData({ 
        loadError: '帖子ID不存在',
        isPostLoading: false 
      });
      return;
    }
    
    this.setData({ isPostLoading: true, loadError: '' });
    
    try {
      const postDetail = await this._getPostDetail(postId);
      this.setData({
        postDetail: postDetail,
        isPostLoading: false
      });
      console.log('postDetail', postDetail);
    } catch (err) {
      console.error('加载帖子详情失败:', err);
      this.setData({ 
        loadError: '加载失败，请重试',
        isPostLoading: false 
      });
    }
  },

}); 
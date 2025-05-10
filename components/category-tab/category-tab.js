Component({
  properties: {
    tabs: {
      type: Array,
      value: []
    },
    categoryId: {
      type: Number,
      value: 0, // 默认0表示不选中任何分类
      observer: function(newVal, oldVal) {
        // 记录分类ID变化
        console.debug('分类ID变化:', oldVal, '->', newVal);
      }
    },
    scrollable: {
      type: Boolean,
      value: true
    },
    customClass: {
      type: String,
      value: ''
    },
    showIcon: {
      type: Boolean,
      value: false
    },
    iconSize: {
      type: Number,
      value: 60
    },
    activeColor: {
      type: String,
      value: '#1aad19'
    },
    inactiveColor: {
      type: String,
      value: '#666666'
    },
    activeBgColor: {
      type: String,
      value: ''
    },
    // 是否支持取消选择（点击当前选中项取消选择）
    enableDeselect: {
      type: Boolean,
      value: true
    }
  },

  data: {
    lastTapTime: 0,
    tapDebounceTime: 300, // 点击防抖时间，单位毫秒
  },

  methods: {
    onTabTap(e) {
      const index = e.currentTarget.dataset.index;
      const tab = this.properties.tabs[index];
      const now = Date.now();
      
      console.debug('分类标签点击 - 当前选中:', tab, '当前分类ID:', this.properties.categoryId);
      
      // 防抖处理：如果两次点击间隔太短，忽略后一次点击
      if (now - this.data.lastTapTime < this.data.tapDebounceTime) {
        console.debug('点击过于频繁，忽略本次点击');
        return;
      }
      this.setData({ lastTapTime: now });
      
      // 检查是否点击了当前已选中的分类
      if (tab.category_id === this.properties.categoryId) {
        console.debug('用户点击了已选中的分类');
        // 如果支持取消选择，触发取消选择事件
        if (this.properties.enableDeselect) {
          console.debug('触发取消分类选择事件');
          this.triggerEvent('change', { 
            index: -1, // 使用-1表示取消选择
            tab: { category_id: 0 } // 使用category_id=0表示没有选中任何分类
          });
        } else {
          // 不支持取消选择时，什么也不做
          console.debug('当前配置不支持取消选择，忽略点击');
        }
        return;
      }
      
      // 触发分类变更事件
      console.debug('触发分类变更事件:', tab.category_id);
      this.triggerEvent('change', { 
        index,
        tab
      });
    }
  },

  lifetimes: {
    attached() {
      if (this.properties.activeBgColor) {
        this.createSelectorQuery()
          .select('.category-scroll')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (res[0] && res[0].node) {
              res[0].node.style.setProperty('--active-bg-color', this.properties.activeBgColor);
              res[0].node.style.setProperty('--active-color', this.properties.activeColor);
            }
          });
      }
    }
  }
}) 
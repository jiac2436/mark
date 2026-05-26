Page({
  data: {
    categories: [
      { label: '钓点', iconPath: '/assets/fishing.png', desc: '标记钓鱼好点位' },
      { label: '发现', iconPath: '/assets/discovery.png', desc: '分享有趣的发现' },
      { label: '提醒', iconPath: '/assets/notice.png', desc: '提醒路过的人留意' },
      { label: '紧急', iconPath: '/assets/urgent.png', desc: '标注紧急事件' },
      { label: '刻舟', iconPath: '/assets/lost_found.png', desc: '记录事物曾在的位置' },
      { label: '求助', iconPath: '/assets/help.png', desc: '标记需要帮助的地点' },
      { label: '热心肠', iconPath: '/assets/kindness.png', desc: '标记善意与帮助' }
    ]
  },

  onBackTap() {
    wx.navigateBack()
  }
})

const api = require('../../utils/api')

const MIN_CONTENT_LENGTH = 5
const MAX_CONTENT_LENGTH = 500

Page({
  data: {
    content: '',
    contentLength: 0,
    isFocused: false,
    isSubmitting: false
  },

  onContentInput(e) {
    const content = e.detail.value || ''
    this.setData({
      content,
      contentLength: content.length
    })
  },

  onContentFocus() {
    this.setData({ isFocused: true })
  },

  onContentBlur() {
    this.setData({ isFocused: false })
  },

  onSubmitTap() {
    if (this.data.isSubmitting) {
      return
    }

    const content = (this.data.content || '').trim()
    if (content.length < MIN_CONTENT_LENGTH) {
      wx.showToast({
        title: '请至少输入5个字',
        icon: 'none'
      })
      return
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      wx.showToast({
        title: '反馈不能超过500字',
        icon: 'none'
      })
      return
    }

    this.setData({ isSubmitting: true })
    api.submitFeedback(content)
      .then(() => {
        wx.showToast({
          title: '已收到反馈',
          icon: 'success',
          duration: 1200
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1200)
      })
      .catch(error => {
        this.setData({ isSubmitting: false })
        wx.showToast({
          title: error && error.message ? error.message : '提交失败',
          icon: 'none'
        })
      })
  }
})

const api = require('../../utils/api')

const MARKER_DOT_ICON = '/assets/marker-dot.png'

const CATEGORIES = [
  { value: 'discovery', label: '发现' },
  { value: 'notice', label: '提醒' },
  { value: 'complaint', label: '吐槽' },
  { value: 'help', label: '求助' }
]

function buildCategories(activeCategory) {
  return CATEGORIES.map(item => Object.assign({}, item, {
    selectedClass: item.value === activeCategory ? 'is-selected' : ''
  }))
}

function parseCoordinate(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

Page({
  data: {
    categories: buildCategories(''),
    point: {
      latitude: 0,
      longitude: 0,
      name: '已选位置',
      address: ''
    },
    previewMarkers: [],
    form: {
      category: '',
      title: '',
      description: ''
    }
  },

  onLoad(options) {
    const latitude = parseCoordinate(options.latitude)
    const longitude = parseCoordinate(options.longitude)
    const name = decodeURIComponent(options.name || '') || '已选位置'
    const address = decodeURIComponent(options.address || '')

    this.setData({
      point: {
        latitude,
        longitude,
        name,
        address
      },
      previewMarkers: [{
        id: 1,
        latitude,
        longitude,
        iconPath: MARKER_DOT_ICON,
        width: 32,
        height: 32
      }]
    })
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      categories: buildCategories(category),
      'form.category': category
    })
  },

  onTitleInput(e) {
    this.setData({
      'form.title': e.detail.value
    })
  },

  onDescriptionInput(e) {
    this.setData({
      'form.description': e.detail.value
    })
  },

  onCancelTap() {
    wx.navigateBack()
  },

  onSubmitTap() {
    const form = this.data.form
    const point = this.data.point

    if (!form.category) {
      wx.showToast({
        title: '请选择标签',
        icon: 'none'
      })
      return
    }

    api.createMarker({
      category: form.category,
      title: (form.title || '').trim(),
      description: (form.description || '').trim(),
      latitude: point.latitude,
      longitude: point.longitude
    }).then(res => {
      const marker = res.marker || {}
      wx.setStorageSync('map_mark_created_marker', {
        id: marker.id,
        latitude: Number(marker.latitude || point.latitude),
        longitude: Number(marker.longitude || point.longitude)
      })
      wx.navigateBack()
    }).catch(error => {
      wx.showToast({
        title: error && error.message ? '提交失败' : '提交失败',
        icon: 'none'
      })
    })
  }
})

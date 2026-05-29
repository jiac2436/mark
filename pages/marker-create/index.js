const api = require('../../utils/api')

const MARKER_DOT_ICON = '/assets/marker-dot.png'
const MAX_IMAGE_COUNT = 5
const MAX_IMAGE_BYTES = 300 * 1024
const IMAGE_MAX_SIZE = 960
const IMAGE_QUALITY = 50
const PHOTO_MARKER_DRAFT_KEY = 'map_mark_photo_marker_draft'

const CATEGORIES = [
  { value: 'fishing', label: '钓点', iconPath: '/assets/fishing.png' },
  { value: 'discovery', label: '发现', iconPath: '/assets/discovery.png' },
  { value: 'notice', label: '提醒', iconPath: '/assets/notice.png' },
  { value: 'urgent', label: '紧急', iconPath: '/assets/urgent.png' },
  { value: 'lost_found', label: '刻舟', iconPath: '/assets/lost_found.png' },
  { value: 'help', label: '求助', iconPath: '/assets/help.png' },
  { value: 'kindness', label: '热心肠', iconPath: '/assets/kindness.png' }
]

const CATEGORY_MAP = CATEGORIES.reduce((map, item) => {
  map[item.value] = item
  return map
}, {})

function buildCategories(activeCategory) {
  return CATEGORIES.map(item => Object.assign({}, item, {
    selectedClass: item.value === activeCategory ? 'is-selected' : ''
  }))
}

function getCategoryIconPath(category) {
  const categoryMeta = CATEGORY_MAP[category]
  return categoryMeta ? categoryMeta.iconPath : MARKER_DOT_ICON
}

function parseCoordinate(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function hasValidCoordinate(point) {
  return point &&
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
}

function getFileSize(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath,
      success: res => resolve(Number(res.size || 0)),
      fail: reject
    })
  })
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
    },
    images: [],
    isSubmitting: false,
    compressCanvasWidth: IMAGE_MAX_SIZE,
    compressCanvasHeight: IMAGE_MAX_SIZE,
    titleFocused: false,
    descriptionFocused: false
  },

  onLoad(options) {
    const photoDraft = this.consumePhotoDraft(options)
    if (options && options.draft === 'photo' && !photoDraft) {
      wx.showToast({
        title: '拍照草稿无效',
        icon: 'none'
      })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }

    const latitude = photoDraft ? photoDraft.latitude : parseCoordinate(options.latitude)
    const longitude = photoDraft ? photoDraft.longitude : parseCoordinate(options.longitude)
    const name = photoDraft ? '当前位置' : (decodeURIComponent(options.name || '') || '已选位置')
    const address = photoDraft ? '' : decodeURIComponent(options.address || '')

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

    if (photoDraft && photoDraft.imagePath) {
      this.prepareSelectedImages([{
        tempFilePath: photoDraft.imagePath
      }])
    }
  },

  consumePhotoDraft(options) {
    if (!options || options.draft !== 'photo') {
      return null
    }

    try {
      const draft = wx.getStorageSync(PHOTO_MARKER_DRAFT_KEY)
      wx.removeStorageSync(PHOTO_MARKER_DRAFT_KEY)
      if (!draft || !draft.imagePath || !hasValidCoordinate(draft)) {
        return null
      }

      return {
        imagePath: draft.imagePath,
        latitude: Number(draft.latitude),
        longitude: Number(draft.longitude)
      }
    } catch (e) {
      return null
    }
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    const iconPath = getCategoryIconPath(category)
    console.log('[MapMark] preview marker icon', {
      category,
      iconPath
    })
    this.setData({
      categories: buildCategories(category),
      'form.category': category,
      'previewMarkers[0].iconPath': iconPath
    })
  },

  onTitleInput(e) {
    this.setData({
      'form.title': e.detail.value
    })
  },

  onTitleFocus() {
    this.setData({ titleFocused: true })
  },

  onTitleBlur() {
    this.setData({ titleFocused: false })
  },

  onDescriptionInput(e) {
    this.setData({
      'form.description': e.detail.value
    })
  },

  onDescriptionFocus() {
    this.setData({ descriptionFocused: true })
  },

  onDescriptionBlur() {
    this.setData({ descriptionFocused: false })
  },

  onChooseImagesTap() {
    const remainCount = MAX_IMAGE_COUNT - this.data.images.length
    if (remainCount <= 0) {
      wx.showToast({
        title: `最多${MAX_IMAGE_COUNT}张`,
        icon: 'none'
      })
      return
    }

    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        this.prepareSelectedImages(res.tempFiles || [])
      }
    })
  },

  onRemoveImageTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isInteger(index)) {
      return
    }

    this.setData({
      images: this.data.images.filter((_, currentIndex) => currentIndex !== index)
    })
  },

  prepareSelectedImages(files) {
    if (!files.length) {
      return
    }

    wx.showLoading({
      title: '处理图片中',
      mask: true
    })

    files.reduce((promise, file) => promise.then(() => this.compressAndAddImage(file.tempFilePath)), Promise.resolve())
      .then(() => {
        wx.hideLoading()
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({
          title: '图片处理失败',
          icon: 'none'
        })
      })
  },

  compressAndAddImage(filePath) {
    return this.compressImage(filePath)
      .then(compressedPath => getFileSize(compressedPath).then(size => ({ compressedPath, size })))
      .then(result => {
        if (result.size > MAX_IMAGE_BYTES) {
          wx.showToast({
            title: '图片超过300KB',
            icon: 'none'
          })
          return
        }

        const nextImages = this.data.images.concat({
          path: result.compressedPath,
          size: result.size
        }).slice(0, MAX_IMAGE_COUNT)

        this.setData({
          images: nextImages
        })
      })
  },

  compressImage(filePath) {
    return this.compressImageWithCanvas(filePath)
      .catch(() => new Promise((resolve, reject) => {
        wx.compressImage({
          src: filePath,
          quality: IMAGE_QUALITY,
          success: res => resolve(res.tempFilePath),
          fail: reject
        })
      }))
  },

  compressImageWithCanvas(filePath) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: filePath,
        success: info => {
          const ratio = Math.min(1, IMAGE_MAX_SIZE / Math.max(info.width, info.height))
          const width = Math.max(1, Math.round(info.width * ratio))
          const height = Math.max(1, Math.round(info.height * ratio))

          this.setData({
            compressCanvasWidth: width,
            compressCanvasHeight: height
          }, () => {
            const ctx = wx.createCanvasContext('imageCompressCanvas', this)
            ctx.clearRect(0, 0, width, height)
            ctx.drawImage(filePath, 0, 0, width, height)
            ctx.draw(false, () => {
              wx.canvasToTempFilePath({
                canvasId: 'imageCompressCanvas',
                fileType: 'jpg',
                quality: IMAGE_QUALITY / 100,
                width,
                height,
                destWidth: width,
                destHeight: height,
                success: res => resolve(res.tempFilePath),
                fail: reject
              }, this)
            })
          })
        },
        fail: reject
      })
    })
  },

  onCancelTap() {
    wx.navigateBack()
  },

  onSubmitTap() {
    if (this.data.isSubmitting) {
      return
    }

    const form = this.data.form
    const point = this.data.point

    if (!form.category) {
      wx.showToast({
        title: '请选择标签',
        icon: 'none'
      })
      return
    }

    this.setData({ isSubmitting: true })
    api.createMarker({
      category: form.category,
      title: (form.title || '').trim(),
      description: (form.description || '').trim(),
      latitude: point.latitude,
      longitude: point.longitude
    }).then(res => {
      const marker = res.marker || {}
      return this.uploadMarkerImages(marker.id).then(uploadResult => {
        wx.setStorageSync('map_mark_created_marker', {
          id: marker.id,
          category: marker.category || this.data.form.category,
          latitude: Number(marker.latitude || point.latitude),
          longitude: Number(marker.longitude || point.longitude)
        })

        if (uploadResult.failedCount) {
          wx.showToast({
            title: '部分图片上传失败',
            icon: 'none'
          })
          setTimeout(() => wx.navigateBack(), 900)
          return
        }

        wx.navigateBack()
      })
    }).catch(error => {
      this.setData({ isSubmitting: false })
      wx.showToast({
        title: error && error.message ? '提交失败' : '提交失败',
        icon: 'none'
      })
    })
  },

  uploadMarkerImages(markerId) {
    const images = this.data.images || []
    if (!markerId || !images.length) {
      return Promise.resolve({ failedCount: 0 })
    }

    wx.showLoading({
      title: '上传图片中',
      mask: true
    })

    let failedCount = 0
    return images.reduce((promise, image) => promise
      .then(() => api.uploadMarkerImage(markerId, image.path))
      .catch(() => {
        failedCount += 1
      }), Promise.resolve())
      .then(() => {
        wx.hideLoading()
        return { failedCount }
      }, error => {
        wx.hideLoading()
        throw error
      })
  }
})

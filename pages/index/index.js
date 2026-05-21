const api = require('../../utils/api')
const { API_BASE_URL } = require('../../config/api')

const FALLBACK_CENTER = {
  latitude: 31.230416,
  longitude: 121.473701
}

const DEFAULT_SCALE = 17
const NATIVE_CLUSTER_GRID_SIZE = 48
const MARKER_TAP_FALLBACK_RADIUS_PX = 72
const MAP_TAP_FALLBACK_DELAY_MS = 120
const MAP_TAP_SUPPRESS_MS = 240
const MARKER_REFRESH_DEBOUNCE_MS = 300
const CREATED_MARKER_REFRESH_DELAY_MS = 500
const CLUSTER_PANEL_SWIPE_THRESHOLD_PX = 24
const NEW_MARKER_HIGHLIGHT_MS = 4000
const HIGHLIGHT_MARKER_ID = 900002
const MARKER_DOT_ICON = '/assets/marker-dot.png'
const CATEGORY_MARKER_SIZE = 44
const SELECTED_CATEGORY_MARKER_SIZE = 58

const MARK_CATEGORIES = [
  { value: 'fishing', label: '钓点', defaultTitle: '一个钓点标记', iconPath: '/assets/fishing.png' },
  { value: 'discovery', label: '发现', defaultTitle: '一个发现标记', iconPath: '/assets/discovery.png' },
  { value: 'notice', label: '提醒', defaultTitle: '一个提醒标记', iconPath: '/assets/notice.png' },
  { value: 'urgent', label: '紧急', defaultTitle: '一个紧急标记', iconPath: '/assets/urgent.png' },
  { value: 'lost_found', label: '刻舟', defaultTitle: '一个刻舟标记', iconPath: '/assets/lost_found.png' },
  { value: 'help', label: '求助', defaultTitle: '一个求助标记', iconPath: '/assets/help.png' },
  { value: 'kindness', label: '热心肠', defaultTitle: '一个热心肠标记', iconPath: '/assets/kindness.png' }
]

const CATEGORY_MAP = MARK_CATEGORIES.reduce((map, item) => {
  map[item.value] = item
  return map
}, {})

function getCategoryMeta(category) {
  return CATEGORY_MAP[category] || CATEGORY_MAP.discovery || MARK_CATEGORIES[0]
}

function formatTime(createdAt) {
  const date = new Date(createdAt)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}

function getDistanceMeters(start, end) {
  const radius = 6371000
  const startLat = start.latitude * Math.PI / 180
  const endLat = end.latitude * Math.PI / 180
  const deltaLat = (end.latitude - start.latitude) * Math.PI / 180
  const deltaLng = (end.longitude - start.longitude) * Math.PI / 180
  const halfChord = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(startLat) * Math.cos(endLat) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)
  return radius * 2 * Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord))
}

function projectToMapPixel(point, scale) {
  const sinLatitude = Math.sin(point.latitude * Math.PI / 180)
  const boundedSinLatitude = Math.min(Math.max(sinLatitude, -0.9999), 0.9999)
  const worldSize = 256 * Math.pow(2, scale)

  return {
    x: (point.longitude + 180) / 360 * worldSize,
    y: (0.5 - Math.log((1 + boundedSinLatitude) / (1 - boundedSinLatitude)) / (4 * Math.PI)) * worldSize
  }
}

function getPixelDistance(start, end, scale) {
  const startPixel = projectToMapPixel(start, scale)
  const endPixel = projectToMapPixel(end, scale)
  const deltaX = startPixel.x - endPixel.x
  const deltaY = startPixel.y - endPixel.y

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY)
}

function getClusterColor(count) {
  if (count >= 7) {
    return '#7f1d1d'
  }
  if (count >= 5) {
    return '#991b1b'
  }
  if (count >= 3) {
    return '#dc2626'
  }
  if (count >= 2) {
    return '#ef4444'
  }
  return '#f87171'
}

function normalizeRemoteMarker(marker) {
  const createdAt = marker && marker.createdAt ? new Date(marker.createdAt).getTime() : Date.now()

  return {
    id: marker.id,
    category: marker.category,
    title: marker.title || '',
    description: marker.description || '',
    latitude: Number(marker.latitude),
    longitude: Number(marker.longitude),
    score: Number(marker.score || 0),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    isMine: !!marker.isMine,
    voteValue: Number(marker.voteValue || 0),
    images: Array.isArray(marker.images) ? marker.images : []
  }
}

function getImageUrl(image) {
  const url = image && image.url ? image.url : ''
  if (!url) {
    return ''
  }
  if (/^https?:\/\//.test(url)) {
    return url
  }
  return `${API_BASE_URL}${url}`
}

function hasValidCoordinate(marker) {
  return marker &&
    typeof marker.latitude === 'number' &&
    typeof marker.longitude === 'number'
}

function buildMapFilterCategories(activeCategory) {
  return MARK_CATEGORIES.map(item => Object.assign({}, item, {
    selectedClass: item.value === activeCategory ? 'is-selected' : ''
  }))
}

Page({
  data: {
    latitude: FALLBACK_CENTER.latitude,
    longitude: FALLBACK_CENTER.longitude,
    scale: DEFAULT_SCALE,
    hasLocationAuth: false,
    locationLabel: '浏览模式：上海人民广场',
    activeCategory: 'all',
    mapFilterCategories: buildMapFilterCategories('all'),
    isMapFilterExpanded: false,
    mapMarkers: [],
    markers: [],
    visibleMarkerCount: 0,
    clusterCount: 0,
    browseTitle: '点击地图标记查看列表',
    browseSubtitle: '',
    panelMode: 'browse',
    mapLocateButtonClass: 'map-locate-button',
    clusterPanelExpanded: true,
    clusterPanelStateClass: 'is-expanded',
    clusterPanelBarTitle: '标记列表',
    clusterPanelBarSubtitle: '',
    showPermissionStrip: false,
    selectedClusterKey: '',
    selectedClusterMarkers: [],
    selectedMarkerId: '',
    selectedMarker: null,
    searchPoint: null,
    highlightMarkerId: '',
    isLoadingMarkers: false
  },

  onLoad() {
    this.mapMarkerIdToBusinessId = {}
    this.businessMarkerById = {}
    this.businessIdToMapMarkerId = {}
    this.nextMapMarkerId = 1
    this.currentMapScale = DEFAULT_SCALE
    this.highlightTimer = null
    this.pendingMapTapTimer = null
    this.markerRefreshTimer = null
    this.markerRequestSeq = 0
    this.lastMarkerInteractionAt = 0
    this.clusterPanelTouchStart = null
    this.hasLoadedInitialMarkers = false
    this.refreshMapState()
    this.loginAndLoadMarkers()
    this.requestCurrentLocation(false)
  },

  onShow() {
    const createdMarker = wx.getStorageSync('map_mark_created_marker')
    if (!createdMarker || !hasValidCoordinate(createdMarker)) {
      return
    }

    wx.removeStorageSync('map_mark_created_marker')
    this.setData({
      latitude: createdMarker.latitude,
      longitude: createdMarker.longitude,
      scale: DEFAULT_SCALE,
      panelMode: 'browse',
      selectedClusterKey: '',
      selectedClusterMarkers: [],
      selectedMarkerId: '',
      selectedMarker: null,
      highlightMarkerId: createdMarker.id
    }, () => {
      this.refreshMarkersAfterViewChange({
        refreshOptions: {
          clearSelection: true
        }
      }).then(() => {
        this.showMarkerGroupByBusinessIds([createdMarker.id])
        this.startHighlightTimer()
      })

      this.scheduleMarkerRefresh({
        delay: CREATED_MARKER_REFRESH_DELAY_MS,
        refreshOptions: {
          clearSelection: true
        },
        afterLoad: () => {
          this.showMarkerGroupByBusinessIds([createdMarker.id])
        }
      })
    })
  },

  onReady() {
    this.mapCtx = wx.createMapContext('markMap', this)
    this.initNativeMarkerCluster()
    this.refreshMapState()
  },

  onUnload() {
    this.clearHighlightTimer()
    this.clearMapTapTimer()
    this.clearMarkerRefreshTimer()
  },

  requestCurrentLocation(showFeedback) {
    wx.getLocation({
      type: 'gcj02',
      success: res => {
        const latitude = res.latitude
        const longitude = res.longitude
        const updateData = {
          hasLocationAuth: true,
          locationLabel: '已定位到当前位置',
          showPermissionStrip: false
        }

        if (showFeedback) {
          updateData.latitude = latitude
          updateData.longitude = longitude
        }

        this.setData(updateData, () => {
          if (showFeedback) {
            this.moveToCurrentLocation()
            this.refreshMarkersAfterViewChange({
              refreshOptions: {
                clearSelection: true
              }
            })
          }
        })

      },
      fail: () => {
        const updateData = {
          hasLocationAuth: false,
          locationLabel: '浏览模式：上海人民广场',
          showPermissionStrip: true
        }

        if (showFeedback) {
          updateData.latitude = FALLBACK_CENTER.latitude
          updateData.longitude = FALLBACK_CENTER.longitude
          updateData.scale = DEFAULT_SCALE
        }

        this.setData(updateData, () => {
          if (showFeedback) {
            this.includePoint(FALLBACK_CENTER)
          }
        })

        if (showFeedback) {
          wx.showToast({
            title: '需要开启定位',
            icon: 'none'
          })
        }
      }
    })
  },

  loginAndLoadMarkers() {
    api.login()
      .then(() => {
        this.loadInitialMarkersOnce()
      })
      .catch(error => {
        this.showApiError(error, '登录失败')
      })
  },

  loadInitialMarkersOnce() {
    if (this.hasLoadedInitialMarkers) {
      return
    }

    this.hasLoadedInitialMarkers = true
    this.loadMarkers()
  },

  loadMarkers(options) {
    const opts = options || {}
    const requestSeq = this.markerRequestSeq + 1
    this.markerRequestSeq = requestSeq

    this.setData({
      isLoadingMarkers: true
    })

    return this.resolveVisibleBounds().then(bounds => api.fetchMarkers(this.buildMarkerQuery(bounds))).then(res => {
      if (requestSeq !== this.markerRequestSeq) {
        return []
      }

      const markers = (res.markers || [])
        .filter(marker => marker && marker.id && marker.category && hasValidCoordinate({
          latitude: Number(marker.latitude),
          longitude: Number(marker.longitude)
        }))
        .map(normalizeRemoteMarker)

      this.setData({
        markers,
        isLoadingMarkers: false
      }, () => {
        this.refreshMapState(opts.refreshOptions || {})
      })

      return markers
    }).catch(error => {
      if (requestSeq !== this.markerRequestSeq) {
        return []
      }

      this.setData({
        isLoadingMarkers: false
      })

      if (this.isBoundsTooLargeError(error)) {
        wx.showToast({
          title: '搜索范围太大了',
          icon: 'none'
        })
        this.debugMapLog('load markers skipped: bounds too large', error)
        return this.data.markers || []
      }

      this.showApiError(error, '加载标记失败')
      return []
    })
  },

  buildMarkerQuery(bounds) {
    const query = {
      minLat: bounds.minLat,
      minLng: bounds.minLng,
      maxLat: bounds.maxLat,
      maxLng: bounds.maxLng
    }

    if (this.data.activeCategory !== 'all') {
      query.category = this.data.activeCategory
    }

    return query
  },

  refreshMarkersAfterViewChange(options) {
    return this.loadMarkers(options || {})
  },

  scheduleMarkerRefresh(options) {
    const opts = options || {}
    const loadOptions = opts.refreshOptions ? {
      refreshOptions: opts.refreshOptions
    } : opts
    this.clearMarkerRefreshTimer()
    this.markerRefreshTimer = setTimeout(() => {
      this.markerRefreshTimer = null
      this.refreshMarkersAfterViewChange(loadOptions).then(markers => {
        if (typeof opts.afterLoad === 'function') {
          opts.afterLoad(markers)
        }
      })
    }, opts.delay || MARKER_REFRESH_DEBOUNCE_MS)
  },

  resolveVisibleBounds() {
    if (!this.mapCtx || !this.mapCtx.getRegion) {
      return Promise.resolve(this.getVisibleBounds())
    }

    return new Promise(resolve => {
      this.mapCtx.getRegion({
        success: res => {
          const southwest = res.southwest || {}
          const northeast = res.northeast || {}
          const minLat = Number(southwest.latitude)
          const minLng = Number(southwest.longitude)
          const maxLat = Number(northeast.latitude)
          const maxLng = Number(northeast.longitude)

          if ([minLat, minLng, maxLat, maxLng].every(Number.isFinite)) {
            resolve({
              minLat,
              minLng,
              maxLat,
              maxLng
            })
            return
          }

          resolve(this.getVisibleBounds())
        },
        fail: () => {
          resolve(this.getVisibleBounds())
        }
      })
    })
  },

  getVisibleBounds() {
    const latitude = Number(this.data.latitude || FALLBACK_CENTER.latitude)
    const longitude = Number(this.data.longitude || FALLBACK_CENTER.longitude)
    const scale = Number(this.currentMapScale || this.data.scale || DEFAULT_SCALE)
    const span = Math.max(0.002, 1 / Math.pow(2, Math.max(scale - 9, 0)))
    const lngSpan = span / Math.max(Math.cos(latitude * Math.PI / 180), 0.2)

    return {
      minLat: Math.max(-90, latitude - span),
      maxLat: Math.min(90, latitude + span),
      minLng: Math.max(-180, longitude - lngSpan),
      maxLng: Math.min(180, longitude + lngSpan)
    }
  },

  onLocateTap() {
    this.requestCurrentLocation(true)
  },

  moveToCurrentLocation() {
    if (!this.mapCtx || !this.mapCtx.moveToLocation) {
      return
    }

    this.mapCtx.moveToLocation()
  },

  onOpenSettingTap() {
    wx.openSetting({
      success: () => {
        this.requestCurrentLocation(true)
      }
    })
  },

  onSearchTap() {
    wx.chooseLocation({
      success: res => {
        const searchPoint = {
          latitude: res.latitude,
          longitude: res.longitude,
          name: res.name || res.address || '搜索位置'
        }

        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          scale: DEFAULT_SCALE,
          searchPoint,
          locationLabel: `搜索：${searchPoint.name}`,
          panelMode: 'browse',
          mapLocateButtonClass: this.getMapLocateButtonClass('browse'),
          clusterPanelExpanded: true,
          clusterPanelStateClass: 'is-expanded',
          showPermissionStrip: !this.data.hasLocationAuth,
          selectedClusterKey: '',
          selectedClusterMarkers: [],
          selectedMarkerId: '',
          selectedMarker: null
        }, () => {
          this.includePoint(searchPoint)
          this.refreshMarkersAfterViewChange({
            refreshOptions: {
              clearSelection: true
            }
          })
        })
      },
      fail: () => {
        wx.showToast({
          title: '未选择位置',
          icon: 'none'
        })
      }
    })
  },

  onMapFilterIconTap() {
    if (this.data.activeCategory !== 'all') {
      return
    }

    this.setData({
      isMapFilterExpanded: !this.data.isMapFilterExpanded
    })
  },

  onMapFilterCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    const isCancel = this.data.activeCategory === category
    const nextCategory = isCancel ? 'all' : category
    const categoryLabel = nextCategory === 'all' ? '全部' : getCategoryMeta(nextCategory).label

    this.setData({
      activeCategory: nextCategory,
      mapFilterCategories: buildMapFilterCategories(nextCategory),
      isMapFilterExpanded: false,
      panelMode: 'browse',
      mapLocateButtonClass: this.getMapLocateButtonClass('browse'),
      clusterPanelExpanded: true,
      clusterPanelStateClass: 'is-expanded',
      showPermissionStrip: !this.data.hasLocationAuth,
      selectedClusterKey: '',
      selectedClusterMarkers: [],
      selectedMarkerId: '',
      selectedMarker: null
    }, () => {
      this.refreshMarkersAfterViewChange({
        refreshOptions: {
          clearSelection: true
        }
      })
    })
  },

  onStartSelectLocationTap() {
    this.onCreateMarkerEntryTap()
  },

  onCreateMarkerEntryTap() {
    wx.getLocation({
      type: 'gcj02',
      success: location => {
        this.setData({
          hasLocationAuth: true,
          locationLabel: '已定位到当前位置',
          showPermissionStrip: false
        })
        this.chooseMarkerLocation(location)
      },
      fail: () => {
        this.setData({
          hasLocationAuth: false,
          showPermissionStrip: true
        })
        wx.showToast({
          title: '需要开启定位',
          icon: 'none'
        })
      }
    })
  },

  chooseMarkerLocation(userLocation) {
    wx.chooseLocation({
      success: res => {
        const point = {
          latitude: res.latitude,
          longitude: res.longitude,
          title: res.name || '',
          address: res.address || ''
        }

        api.validateMarkerLocation({
          userLatitude: userLocation.latitude,
          userLongitude: userLocation.longitude,
          markerLatitude: point.latitude,
          markerLongitude: point.longitude
        }).then(validateResult => {
          if (!validateResult.allowed) {
            wx.showToast({
              title: '超出可标记范围',
              icon: 'none'
            })
            return
          }

          wx.navigateTo({
            url: `/pages/marker-create/index?latitude=${encodeURIComponent(point.latitude)}&longitude=${encodeURIComponent(point.longitude)}&name=${encodeURIComponent(point.title)}&address=${encodeURIComponent(point.address)}`
          })
        }).catch(error => {
          this.showApiError(error, '位置校验失败')
        })
      },
      fail: () => {
        wx.showToast({
          title: '未选择位置',
          icon: 'none'
        })
      }
    })
  },

  onMarkerTap(e) {
    if (this.data.longPressedMarkerId) {
      this.setData({ longPressedMarkerId: '' })
    }

    const markerId = this.getMarkerEventId(e)
    const businessMarker = this.getBusinessMarkerByMapId(markerId)
    this.lastMarkerInteractionAt = Date.now()
    this.clearMapTapTimer()

    this.debugMapLog('marker tap', {
      eventType: e.type,
      markerId,
      detail: e.detail,
      hasBusinessMarker: !!businessMarker,
      businessMarkerId: businessMarker ? businessMarker.id : ''
    })

    if (markerId === HIGHLIGHT_MARKER_ID && this.data.highlightMarkerId) {
      this.showMarkerGroupByBusinessIds([this.data.highlightMarkerId])
      return
    }

    if (businessMarker) {
      this.showMarkerGroup([businessMarker])
    }
  },

  onMapTap(e) {
    if (this.data.longPressedMarkerId) {
      this.setData({ longPressedMarkerId: '' })
    }

    this.debugMapLog('map tap', {
      detail: e.detail
    })

    const point = e.detail
    if (!hasValidCoordinate(point)) {
      return
    }

    this.clearMapTapTimer()
    this.pendingMapTapTimer = setTimeout(() => {
      this.pendingMapTapTimer = null

      if (Date.now() - this.lastMarkerInteractionAt < MAP_TAP_SUPPRESS_MS) {
        return
      }

      this.showMarkersNearMapTap(point)
    }, MAP_TAP_FALLBACK_DELAY_MS)
  },

  onMapRegionChange(e) {
    if (this.data.longPressedMarkerId) {
      this.setData({ longPressedMarkerId: '' })
    }

    const scale = Number(e.detail && e.detail.scale)
    if (scale > 0) {
      this.currentMapScale = scale
    }

    if (e.type === 'end') {
      this.scheduleMarkerRefresh()
    }
  },

  onClusterPanelBarTouchStart(e) {
    if (this.data.longPressedMarkerId) {
      this.setData({ longPressedMarkerId: '' })
    }

    const touch = e.touches && e.touches[0]
    if (!touch) {
      return
    }

    this.clusterPanelTouchStart = {
      x: touch.clientX,
      y: touch.clientY
    }
  },

  onClusterPanelBarTouchEnd(e) {
    const start = this.clusterPanelTouchStart
    const touch = e.changedTouches && e.changedTouches[0]
    this.clusterPanelTouchStart = null

    if (!start || !touch) {
      return
    }

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y

    if (Math.abs(deltaY) < CLUSTER_PANEL_SWIPE_THRESHOLD_PX || Math.abs(deltaY) <= Math.abs(deltaX)) {
      return
    }

    if (deltaY > 0) {
      this.setClusterPanelExpanded(false)
      return
    }

    this.setClusterPanelExpanded(true, {
      clearDetail: true
    })
  },

  onMarkerListItemTap(e) {
    const markerId = e.currentTarget.dataset.id

    if (this.data.selectedMarkerId === markerId) {
      const selectedClusterMarkers = this.withSelectedListItemClass(this.data.selectedClusterMarkers, '')
      this.setData({
        selectedMarkerId: '',
        selectedMarker: null,
        selectedClusterMarkers
      }, () => {
        this.refreshMapSelectionState()
      })
      return
    }

    const marker = this.data.selectedClusterMarkers.find(item => item.id === markerId)
    if (!marker) {
      return
    }

    const selectedClusterMarkers = this.withSelectedListItemClass(this.data.selectedClusterMarkers, markerId)

    this.setData({
      latitude: marker.latitude,
      longitude: marker.longitude,
      selectedMarkerId: markerId,
      selectedMarker: selectedClusterMarkers.find(item => item.id === markerId),
      selectedClusterMarkers
    }, () => {
      this.refreshMapSelectionState()
    })
  },

  onMarkerListItemLongPress(e) {
    const markerId = e.currentTarget.dataset.id
    this.setData({
      longPressedMarkerId: markerId
    })
  },

  onMarkerListScroll(e) {
    if (this.data.longPressedMarkerId) {
      this.setData({ longPressedMarkerId: '' })
    }
  },

  onMaskTap() {
    this.setData({ longPressedMarkerId: '' })
  },

  onVoteTap(e) {
    if (!this.data.hasLocationAuth) {
      wx.showToast({
        title: '开启定位后可评价',
        icon: 'none'
      })
      return
    }

    const markerId = e.currentTarget.dataset.id || (this.data.selectedMarker && this.data.selectedMarker.id)
    const selectedMarker = this.data.selectedClusterMarkers.find(item => item.id === markerId) || this.data.selectedMarker

    if (!selectedMarker) {
      return
    }

    const rawVoteValue = Number(e.currentTarget.dataset.vote)
    if (![1, -1].includes(rawVoteValue)) {
      return
    }

    const nextVoteValue = Number(selectedMarker.voteValue || 0) === rawVoteValue ? 0 : rawVoteValue
    const isCancel = nextVoteValue === 0

    if (isCancel) {
      this.setData({
        longPressedMarkerId: '',
        animatingVoteValue: null
      })
    } else {
      this.setData({
        animatingVoteValue: rawVoteValue
      })

      setTimeout(() => {
        this.setData({
          longPressedMarkerId: '',
          animatingVoteValue: null
        }, () => {
          this.refreshMapState({
            selectedMarkerId: selectedMarker.id,
            panelMode: 'cluster'
          })
        })
      }, 500)
    }

    api.voteMarker(selectedMarker.id, nextVoteValue)
        .then(res => {
          this.updateMarkerVote(selectedMarker.id, res.score, res.voteValue)
        })
        .catch(error => {
          this.showApiError(error, '评价失败')
        })
  },

  onDeleteMarkerTap(e) {
    const markerId = e.currentTarget.dataset.id || (this.data.selectedMarker && this.data.selectedMarker.id)
    const selectedMarker = this.data.selectedClusterMarkers.find(item => item.id === markerId) || this.data.selectedMarker
    if (!selectedMarker || !selectedMarker.isMine) {
      return
    }

    wx.showModal({
      title: '删除标记',
      content: '删除后本机不再显示这条标记。',
      confirmText: '删除',
      confirmColor: '#dc2626',
      success: res => {
        if (!res.confirm) {
          return
        }

        api.deleteMarker(selectedMarker.id)
          .then(() => {
            this.setData({
              markers: this.data.markers.filter(marker => marker.id !== selectedMarker.id),
              highlightMarkerId: this.data.highlightMarkerId === selectedMarker.id ? '' : this.data.highlightMarkerId
            }, () => {
              this.refreshMapState({
                clearSelection: true
              })
            })
          })
          .catch(error => {
            this.showApiError(error, '删除失败')
          })
      }
    })
  },

  onNavigateMarkerTap(e) {
    const markerId = e.currentTarget.dataset.id || (this.data.selectedMarker && this.data.selectedMarker.id)
    const selectedMarker = this.data.selectedClusterMarkers.find(item => item.id === markerId) || this.data.selectedMarker
    if (!selectedMarker || !hasValidCoordinate(selectedMarker)) {
      wx.showToast({
        title: '位置无效',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '到这里去',
      content: '即将打开微信地图查看路线',
      confirmText: '打开地图',
      success: res => {
        if (!res.confirm) {
          return
        }

        wx.openLocation({
          latitude: selectedMarker.latitude,
          longitude: selectedMarker.longitude,
          name: selectedMarker.displayTitle,
          address: selectedMarker.displayDescription,
          scale: 18,
          fail: () => {
            wx.showToast({
              title: '打开地图失败',
              icon: 'none'
            })
          }
        })
      }
    })
  },

  onPreviewMarkerImageTap(e) {
    const markerId = e.currentTarget.dataset.id
    const currentUrl = e.currentTarget.dataset.url
    const marker = this.data.selectedClusterMarkers.find(item =>
      (item.images || []).some(image => image.id === markerId)
    )
    const urls = marker ? (marker.images || []).map(image => image.fullUrl).filter(Boolean) : [currentUrl]

    if (!currentUrl || !urls.length) {
      return
    }

    wx.previewImage({
      current: currentUrl,
      urls
    })
  },

  onReportTap() {
    const selectedMarker = this.data.selectedMarker
    if (!selectedMarker) {
      return
    }

    api.reportMarker(selectedMarker.id, '')
      .then(() => {
        wx.showToast({
          title: '已收到举报',
          icon: 'none'
        })
      })
      .catch(error => {
        this.showApiError(error, '举报失败')
      })
  },

  initNativeMarkerCluster() {
    if (!this.mapCtx || !this.mapCtx.initMarkerCluster) {
      this.debugMapLog('initMarkerCluster unsupported')
      return
    }

    this.debugMapLog('initMarkerCluster start', {
      gridSize: NATIVE_CLUSTER_GRID_SIZE
    })

    if (this.mapCtx.on) {
      this.mapCtx.on('markerClusterClick', res => {
        this.onNativeMarkerClusterClick(res)
      })
    }

    this.mapCtx.initMarkerCluster({
      gridSize: NATIVE_CLUSTER_GRID_SIZE,
      zoomOnClick: false,
      success: res => {
        this.debugMapLog('initMarkerCluster success', {
          gridSize: NATIVE_CLUSTER_GRID_SIZE,
          raw: res
        })
      },
      fail: err => {
        this.debugMapLog('initMarkerCluster fail', err)
      }
    })
  },

  onNativeMarkerClusterClick(res) {
    const cluster = res.cluster || res
    this.lastMarkerInteractionAt = Date.now()
    this.clearMapTapTimer()
    this.debugMapLog('markerClusterClick', {
      markerIds: this.getMarkerIdsFromCluster(cluster),
      raw: res
    })
    this.showMarkerGroupByMapIds(this.getMarkerIdsFromCluster(cluster))
  },

  refreshMapState(options) {
    const opts = options || {}
    const displayMarkers = this.getDisplayMarkers()
    const mapMarkers = this.buildNativeMapMarkers(displayMarkers)

    if (this.data.highlightMarkerId) {
      const highlightedMarker = displayMarkers.find(marker => marker.id === this.data.highlightMarkerId)
      if (highlightedMarker) {
        mapMarkers.push(this.createSpecialMarker(HIGHLIGHT_MARKER_ID, highlightedMarker, '新', '#0f766e', 95))
      }
    }

    this.updateNativeMapMarkers(mapMarkers)

    const shouldPreservePanel = !opts.clearSelection && !opts.selectedMarkerId && this.data.panelMode === 'cluster'
    let preservedPanel = null
    if (shouldPreservePanel) {
      preservedPanel = this.getPreservedClusterPanelState()
    }

    let selectedMarkerId = opts.clearSelection ? '' : (opts.selectedMarkerId || this.data.selectedMarkerId)
    const updateData = {
      mapMarkers,
      visibleMarkerCount: displayMarkers.length,
      clusterCount: 0,
      browseTitle: displayMarkers.length ? '点击地图标记查看列表' : '当前分类暂无标记',
      browseSubtitle: displayMarkers.length ?
        `当前显示 ${displayMarkers.length} 条标记。` :
        '可切换分类、搜索位置，或开启定位后新增标记。'
    }

    if (preservedPanel) {
      if (preservedPanel.shouldUpdate) {
        Object.assign(updateData, preservedPanel.updateData)
      }
      this.setData(updateData)
      return
    }

    const selectedGroupMarkers = this.getCurrentSelectedGroupMarkers(selectedMarkerId)

    if (selectedGroupMarkers.length) {
      const decoratedMarkers = this.withSelectedListItemClass(selectedGroupMarkers, selectedMarkerId)

      updateData.panelMode = opts.panelMode || 'cluster'
      updateData.mapLocateButtonClass = this.getMapLocateButtonClass(updateData.panelMode, this.data.clusterPanelExpanded)
      updateData.clusterPanelBarTitle = '标记列表'
      updateData.clusterPanelBarSubtitle = `${selectedGroupMarkers.length} 条标记，点击列表查看详情`
      updateData.selectedClusterKey = this.getMarkerGroupKey(selectedGroupMarkers)
      updateData.selectedClusterMarkers = decoratedMarkers
      updateData.selectedMarkerId = selectedMarkerId
      updateData.selectedMarker = decoratedMarkers.find(marker => marker.id === selectedMarkerId) || decoratedMarkers[0]
    } else if (selectedMarkerId && this.businessMarkerById[selectedMarkerId]) {
      const selectedMarker = this.businessMarkerById[selectedMarkerId]
      const decoratedMarkers = this.withSelectedListItemClass([selectedMarker], selectedMarkerId)

      updateData.panelMode = opts.panelMode || 'cluster'
      updateData.mapLocateButtonClass = this.getMapLocateButtonClass(updateData.panelMode, this.data.clusterPanelExpanded)
      updateData.clusterPanelBarTitle = '标记列表'
      updateData.clusterPanelBarSubtitle = '1 条标记，点击列表查看详情'
      updateData.selectedClusterKey = this.getMarkerGroupKey([selectedMarker])
      updateData.selectedClusterMarkers = decoratedMarkers
      updateData.selectedMarkerId = selectedMarkerId
      updateData.selectedMarker = decoratedMarkers[0]
    } else if (opts.clearSelection || this.data.panelMode === 'cluster' || opts.panelMode === 'cluster') {
      updateData.panelMode = opts.panelMode === 'cluster' ? 'browse' : (opts.panelMode || 'browse')
      updateData.mapLocateButtonClass = this.getMapLocateButtonClass(updateData.panelMode)
      updateData.clusterPanelExpanded = true
      updateData.clusterPanelStateClass = 'is-expanded'
      updateData.selectedClusterKey = ''
      updateData.selectedClusterMarkers = []
      updateData.selectedMarkerId = ''
      updateData.selectedMarker = null
    }

    this.setData(updateData)
  },

  getPreservedClusterPanelState() {
    const previousMarkers = this.data.selectedClusterMarkers || []
    if (!previousMarkers.length) {
      return null
    }

    const previousIds = previousMarkers.map(marker => marker.id)
    const nextMarkers = previousIds
      .map(markerId => this.businessMarkerById[markerId])
      .filter(Boolean)

    if (!nextMarkers.length) {
      return {
        shouldUpdate: true,
        updateData: this.buildClosedClusterPanelData()
      }
    }

    const sortedMarkers = this.sortMarkersForList(nextMarkers)
    const selectedMarkerId = sortedMarkers.some(marker => marker.id === this.data.selectedMarkerId) ?
      this.data.selectedMarkerId :
      ''
    const decoratedMarkers = this.withSelectedListItemClass(sortedMarkers, selectedMarkerId)
    const nextGroupKey = this.getMarkerGroupKey(sortedMarkers)
    const previousSignature = this.getMarkerListSignature(previousMarkers)
    const nextSignature = this.getMarkerListSignature(decoratedMarkers)

    if (
      this.data.selectedClusterKey === nextGroupKey &&
      previousSignature === nextSignature &&
      this.data.selectedMarkerId === selectedMarkerId
    ) {
      return {
        shouldUpdate: false
      }
    }

    return {
      shouldUpdate: true,
      updateData: {
        panelMode: 'cluster',
        mapLocateButtonClass: this.getMapLocateButtonClass('cluster', this.data.clusterPanelExpanded),
        clusterPanelBarTitle: '标记列表',
        clusterPanelBarSubtitle: `${sortedMarkers.length} 条标记，点击列表查看详情`,
        selectedClusterKey: nextGroupKey,
        selectedClusterMarkers: decoratedMarkers,
        selectedMarkerId,
        selectedMarker: selectedMarkerId ?
          decoratedMarkers.find(marker => marker.id === selectedMarkerId) :
          null
      }
    }
  },

  buildClosedClusterPanelData() {
    return {
      panelMode: 'browse',
      mapLocateButtonClass: this.getMapLocateButtonClass('browse'),
      clusterPanelExpanded: true,
      clusterPanelStateClass: 'is-expanded',
      selectedClusterKey: '',
      selectedClusterMarkers: [],
      selectedMarkerId: '',
      selectedMarker: null
    }
  },

  getMarkerListSignature(markers) {
    return (markers || [])
      .map(marker => [
        marker.id,
        marker.category,
        marker.title,
        marker.description,
        marker.latitude,
        marker.longitude,
        marker.score,
        marker.voteValue,
        marker.isMine
      ].join(':'))
      .join('|')
  },

  createSpecialMarker(id, point, content, color, zIndex) {
    return {
      id,
      latitude: point.latitude,
      longitude: point.longitude,
      iconPath: MARKER_DOT_ICON,
      width: 36,
      height: 36,
      joinCluster: false,
      zIndex,
      label: {
        content,
        color: '#ffffff',
        fontSize: 13,
        bgColor: color,
        borderRadius: 18,
        padding: 9,
        textAlign: 'center',
        anchorX: -18,
        anchorY: -18
      }
    }
  },

  buildNativeMapMarkers(displayMarkers) {
    const mapMarkerIdToBusinessId = {}
    const businessMarkerById = {}
    const iconStats = {}
    const selectedMarkerId = this.data.selectedMarkerId

    const mapMarkers = displayMarkers.map(marker => {
      const mapMarkerId = this.getStableMapMarkerId(marker.id)
      const categoryMeta = getCategoryMeta(marker.category)
      const iconPath = categoryMeta.iconPath || MARKER_DOT_ICON
      const isSelected = marker.id === selectedMarkerId
      mapMarkerIdToBusinessId[mapMarkerId] = marker.id
      businessMarkerById[marker.id] = marker
      iconStats[marker.category || 'unknown'] = {
        iconPath,
        count: (iconStats[marker.category || 'unknown'] ? iconStats[marker.category || 'unknown'].count : 0) + 1
      }

      const mapMarker = {
        id: mapMarkerId,
        latitude: marker.latitude,
        longitude: marker.longitude,
        iconPath,
        width: isSelected ? SELECTED_CATEGORY_MARKER_SIZE : CATEGORY_MARKER_SIZE,
        height: isSelected ? SELECTED_CATEGORY_MARKER_SIZE : CATEGORY_MARKER_SIZE,
        joinCluster: !isSelected,
        zIndex: isSelected ? 80 : 1
      }

      return mapMarker
    })

    this.mapMarkerIdToBusinessId = mapMarkerIdToBusinessId
    this.businessMarkerById = businessMarkerById

    this.debugMapLog('business markers built', {
      count: mapMarkers.length,
      iconStats,
      sample: mapMarkers.slice(0, 5).map(marker => ({
        id: marker.id,
        iconPath: marker.iconPath,
        latitude: marker.latitude,
        longitude: marker.longitude,
        joinCluster: marker.joinCluster
      }))
    })

    return mapMarkers
  },

  getStableMapMarkerId(businessMarkerId) {
    if (!this.businessIdToMapMarkerId[businessMarkerId]) {
      this.businessIdToMapMarkerId[businessMarkerId] = this.nextMapMarkerId
      this.nextMapMarkerId += 1
    }

    return this.businessIdToMapMarkerId[businessMarkerId]
  },

  updateNativeMapMarkers(mapMarkers) {
    if (!this.mapCtx || !this.mapCtx.addMarkers) {
      this.debugMapLog('addMarkers fallback setData', {
        count: mapMarkers.length
      })
      this.setData({
        mapMarkers
      })
      return
    }

    this.mapCtx.addMarkers({
      clear: true,
      markers: mapMarkers,
      success: res => {
        this.debugMapLog('addMarkers success', {
          count: mapMarkers.length,
          iconPaths: Array.from(new Set(mapMarkers.map(marker => marker.iconPath))),
          ids: mapMarkers.map(marker => marker.id),
          raw: res
        })
      },
      fail: err => {
        this.debugMapLog('addMarkers fail', err)
      }
    })
  },

  getBusinessMarkerByMapId(mapMarkerId) {
    const businessMarkerId = this.mapMarkerIdToBusinessId[Number(mapMarkerId)]
    return businessMarkerId ? this.businessMarkerById[businessMarkerId] : null
  },

  refreshMapSelectionState() {
    const displayMarkers = this.getDisplayMarkers()
    const mapMarkers = this.buildNativeMapMarkers(displayMarkers)

    if (this.data.highlightMarkerId) {
      const highlightedMarker = displayMarkers.find(marker => marker.id === this.data.highlightMarkerId)
      if (highlightedMarker) {
        mapMarkers.push(this.createSpecialMarker(HIGHLIGHT_MARKER_ID, highlightedMarker, '新', '#0f766e', 95))
      }
    }

    this.updateNativeMapMarkers(mapMarkers)
    this.setData({ mapMarkers })
  },

  getMarkerIdsFromCluster(cluster) {
    if (!cluster) {
      return []
    }

    if (Array.isArray(cluster.markerIds)) {
      return cluster.markerIds
    }

    if (Array.isArray(cluster.markers)) {
      return cluster.markers
        .map(marker => {
          if (typeof marker === 'number' || typeof marker === 'string') {
            return marker
          }

          return marker && (marker.id !== undefined ? marker.id : marker.markerId)
        })
        .filter(markerId => markerId !== undefined)
    }

    return []
  },

  showMarkerGroupByMapIds(mapMarkerIds) {
    const markers = (mapMarkerIds || [])
      .map(markerId => this.getBusinessMarkerByMapId(markerId))
      .filter(Boolean)

    if (markers.length) {
      this.showMarkerGroup(markers)
      return
    }

    this.debugMapLog('marker group resolve empty', {
      mapMarkerIds,
      knownMapMarkerIds: Object.keys(this.mapMarkerIdToBusinessId || {})
    })
  },

  showMarkersNearMapTap(point) {
    this.getCurrentMapScale(scale => {
      const markers = this.getFallbackMarkersNearPoint(point, scale)

      if (!markers.length) {
        this.debugMapLog('map tap fallback empty', {
          point,
          scale
        })
        return
      }

      this.debugMapLog('map tap fallback match', {
        count: markers.length,
        markerIds: markers.map(marker => marker.id),
        scale
      })
      this.showMarkerGroup(markers)
    })
  },

  getCurrentMapScale(done) {
    if (!this.mapCtx || !this.mapCtx.getScale) {
      done(this.currentMapScale || this.data.scale || DEFAULT_SCALE)
      return
    }

    this.mapCtx.getScale({
      success: res => {
        const scale = Number(res.scale)
        if (scale > 0) {
          this.currentMapScale = scale
        }
        done(this.currentMapScale || this.data.scale || DEFAULT_SCALE)
      },
      fail: () => {
        done(this.currentMapScale || this.data.scale || DEFAULT_SCALE)
      }
    })
  },

  getFallbackMarkersNearPoint(point, scale) {
    const displayMarkers = this.getDisplayMarkers()
    const rankedMarkers = displayMarkers
      .map(marker => Object.assign({}, marker, {
        tapDistance: getPixelDistance(point, marker, scale)
      }))
      .sort((left, right) => left.tapDistance - right.tapDistance)

    const nearestMarker = rankedMarkers[0]
    if (!nearestMarker || nearestMarker.tapDistance > MARKER_TAP_FALLBACK_RADIUS_PX) {
      return []
    }

    const directMatches = rankedMarkers.filter(marker => marker.tapDistance <= MARKER_TAP_FALLBACK_RADIUS_PX)
    if (directMatches.length > 1) {
      return directMatches.map(marker => this.businessMarkerById[marker.id] || marker)
    }

    return this.getFallbackClusterGroup(nearestMarker, displayMarkers, scale)
  },

  getFallbackClusterGroup(targetMarker, displayMarkers, scale) {
    const group = [targetMarker]
    const visited = {
      [targetMarker.id]: true
    }
    let changed = true

    while (changed) {
      changed = false
      displayMarkers.forEach(marker => {
        if (visited[marker.id]) {
          return
        }

        const isNearGroup = group.some(groupMarker =>
          getPixelDistance(marker, groupMarker, scale) <= NATIVE_CLUSTER_GRID_SIZE
        )

        if (isNearGroup) {
          visited[marker.id] = true
          group.push(marker)
          changed = true
        }
      })
    }

    return group.map(marker => this.businessMarkerById[marker.id] || marker)
  },

  getCurrentSelectedGroupMarkers(selectedMarkerId) {
    if (!selectedMarkerId || !this.data.selectedClusterMarkers.length) {
      return []
    }

    const markers = this.data.selectedClusterMarkers
      .map(marker => this.businessMarkerById[marker.id])
      .filter(Boolean)

    return markers.some(marker => marker.id === selectedMarkerId) ? markers : []
  },

  showMarkerGroupByBusinessIds(businessMarkerIds) {
    const markers = (businessMarkerIds || [])
      .map(markerId => this.businessMarkerById[markerId])
      .filter(Boolean)

    if (markers.length) {
      this.showMarkerGroup(markers)
    }
  },

  setClusterPanelExpanded(expanded, options) {
    const updateData = {
      clusterPanelExpanded: expanded,
      clusterPanelStateClass: expanded ? 'is-expanded' : 'is-collapsed',
      mapLocateButtonClass: this.getMapLocateButtonClass(this.data.panelMode, expanded)
    }

    if (expanded && options && options.clearDetail) {
      updateData.selectedMarkerId = ''
      updateData.selectedMarker = null
      updateData.selectedClusterMarkers = this.withSelectedListItemClass(this.data.selectedClusterMarkers, '')
    }

    this.setData(updateData, () => {
      if (expanded && options && options.clearDetail) {
        this.refreshMapSelectionState()
      }
    })
  },

  showMarkerGroup(markers) {
    const sortedMarkers = this.sortMarkersForList(markers)
    const nextGroupKey = this.getMarkerGroupKey(sortedMarkers)

    if (
      this.data.panelMode === 'cluster' &&
      this.data.selectedClusterKey === nextGroupKey
    ) {
      return
    }

    const barSubtitle = sortedMarkers.length ?
      `${sortedMarkers.length} 条标记，点击列表查看详情` :
      ''

    this.setData({
      panelMode: 'cluster',
      mapLocateButtonClass: this.getMapLocateButtonClass('cluster', true),
      clusterPanelExpanded: true,
      clusterPanelStateClass: 'is-expanded',
      clusterPanelBarTitle: '标记列表',
      clusterPanelBarSubtitle: barSubtitle,
      selectedClusterKey: nextGroupKey,
      selectedClusterMarkers: this.withSelectedListItemClass(sortedMarkers, ''),
      selectedMarkerId: '',
      selectedMarker: null
    })
  },

  getMarkerGroupKey(markers) {
    return (markers || [])
      .map(marker => marker.id)
      .sort()
      .join('|')
  },

  getMapLocateButtonClass(panelMode, clusterPanelExpanded) {
    if (panelMode === 'cluster') {
      return clusterPanelExpanded === false ?
        'map-locate-button is-above-collapsed-panel' :
        'map-locate-button is-above-cluster-panel'
    }

    return 'map-locate-button'
  },

  getDisplayMarkers() {
    const allMarkers = this.data.markers || []
    const activeCategory = this.data.activeCategory

    return allMarkers
      .filter(marker => activeCategory === 'all' || marker.category === activeCategory)
      .map(marker => this.decorateMarker(marker))
  },

  decorateMarker(marker) {
    const categoryMeta = getCategoryMeta(marker.category)
    const title = (marker.title || '').trim()
    const description = (marker.description || '').trim()
    const voteValue = Number(marker.voteValue || 0)
    const displayScore = Number(marker.score || 0)

    return {
      id: marker.id,
      category: marker.category,
      categoryLabel: categoryMeta.label,
      categoryClass: `tag category-${marker.category}`,
      title,
      description,
      displayTitle: title || categoryMeta.defaultTitle,
      displayDescription: description || '暂无补充描述',
      latitude: marker.latitude,
      longitude: marker.longitude,
      score: Number(marker.score || 0),
      displayScore,
      createdAt: marker.createdAt,
      timeText: formatTime(marker.createdAt),
      listItemClass: 'marker-list-item',
      isMine: !!marker.isMine,
      images: (marker.images || [])
        .map(image => Object.assign({}, image, {
          fullUrl: getImageUrl(image)
        }))
        .filter(image => image.fullUrl),
      voteValue,
      isLiked: voteValue === 1,
      isDisliked: voteValue === -1,
      likeButtonClass: voteValue === 1 ? 'vote-button is-active' : 'vote-button',
      dislikeButtonClass: voteValue === -1 ? 'vote-button is-active' : 'vote-button'
    }
  },

  updateMarkerVote(markerId, score, voteValue) {
    const markers = this.data.markers.map(marker => {
      if (marker.id !== markerId) {
        return marker
      }

      return Object.assign({}, marker, {
        score: Number(score || 0),
        voteValue: Number(voteValue || 0)
      })
    })

    this.setData({
      markers
    }, () => {
      this.refreshMapState({
        selectedMarkerId: markerId,
        panelMode: 'cluster'
      })
    })
  },

  sortMarkersForList(markers) {
    const searchPoint = this.data.searchPoint
    return markers.slice().sort((left, right) => {
      if (searchPoint) {
        const leftDistance = getDistanceMeters(searchPoint, left)
        const rightDistance = getDistanceMeters(searchPoint, right)
        if (Math.abs(leftDistance - rightDistance) > 1) {
          return leftDistance - rightDistance
        }
      }

      if (right.displayScore !== left.displayScore) {
        return right.displayScore - left.displayScore
      }

      return right.createdAt - left.createdAt
    })
  },

  getMarkerEventId(e) {
    const detail = e.detail || {}
    const markerId = detail.markerId !== undefined ?
      detail.markerId :
      (detail.clusterId !== undefined ? detail.clusterId : (e.markerId !== undefined ? e.markerId : e.clusterId))
    return Number(markerId)
  },

  debugMapLog(label, payload) {
    console.log(`[MapMark] ${label}`, payload || '')
  },

  showApiError(error, fallbackTitle) {
    const message = error && error.message ? error.message : fallbackTitle
    wx.showToast({
      title: message.length > 12 ? fallbackTitle : message,
      icon: 'none'
    })
    this.debugMapLog(fallbackTitle, error)
  },

  isBoundsTooLargeError(error) {
    const message = error && error.message ? error.message : ''
    return message.indexOf('地图视野范围过大') !== -1 ||
      message.indexOf('搜索范围太大') !== -1
  },

  includePoint(point) {
    if (!this.mapCtx || !hasValidCoordinate(point)) {
      return
    }

    this.mapCtx.includePoints({
      points: [point],
      padding: [80, 80, 80, 80]
    })
  },

  withSelectedListItemClass(markers, selectedMarkerId) {
    return markers.map(marker => Object.assign({}, marker, {
      listItemClass: marker.id === selectedMarkerId ? 'marker-list-item is-selected' : 'marker-list-item'
    }))
  },

  startHighlightTimer() {
    this.clearHighlightTimer()
    this.highlightTimer = setTimeout(() => {
      this.setData({
        highlightMarkerId: ''
      }, () => {
        this.refreshMapState()
      })
    }, NEW_MARKER_HIGHLIGHT_MS)
  },

  clearHighlightTimer() {
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer)
      this.highlightTimer = null
    }
  },

  clearMapTapTimer() {
    if (this.pendingMapTapTimer) {
      clearTimeout(this.pendingMapTapTimer)
      this.pendingMapTapTimer = null
    }
  },

  clearMarkerRefreshTimer() {
    if (this.markerRefreshTimer) {
      clearTimeout(this.markerRefreshTimer)
      this.markerRefreshTimer = null
    }
  }
})

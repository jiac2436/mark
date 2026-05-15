const STORAGE_KEYS = {
  userId: 'map_mark_user_id',
  ownMarkers: 'map_mark_own_markers',
  votes: 'map_mark_votes'
}

const FALLBACK_CENTER = {
  latitude: 31.230416,
  longitude: 121.473701
}

const DEFAULT_SCALE = 17
const NATIVE_CLUSTER_GRID_SIZE = 48
const MARKER_TAP_FALLBACK_RADIUS_PX = 72
const MAP_TAP_FALLBACK_DELAY_MS = 120
const MAP_TAP_SUPPRESS_MS = 240
const CLUSTER_PANEL_SWIPE_THRESHOLD_PX = 24
const NEW_MARKER_HIGHLIGHT_MS = 4000
const PENDING_MARKER_ID = 900001
const HIGHLIGHT_MARKER_ID = 900002
const MARKER_DOT_ICON = '/assets/marker-dot.png'

const MARK_CATEGORIES = [
  { value: 'discovery', label: '发现', defaultTitle: '一个发现标记' },
  { value: 'notice', label: '提醒', defaultTitle: '一个提醒标记' },
  { value: 'complaint', label: '吐槽', defaultTitle: '一个吐槽标记' },
  { value: 'help', label: '求助', defaultTitle: '一个求助标记' }
]

const FILTER_CATEGORIES = [
  { value: 'all', label: '全部' }
].concat(MARK_CATEGORIES)

const CATEGORY_MAP = MARK_CATEGORIES.reduce((map, item) => {
  map[item.value] = item
  return map
}, {})

const MOCK_MARKERS = [
  {
    id: 'mock_001',
    category: 'notice',
    title: '广场入口施工',
    description: '靠近地铁口一侧围挡较多，步行需要绕一下。',
    latitude: 31.23051,
    longitude: 121.47372,
    score: 6,
    createdAt: 1767168000000,
    isMine: false
  },
  {
    id: 'mock_002',
    category: 'discovery',
    title: '午后长椅很安静',
    description: '树荫下面适合短暂停留。',
    latitude: 31.23056,
    longitude: 121.47378,
    score: 4,
    createdAt: 1767171600000,
    isMine: false
  },
  {
    id: 'mock_003',
    category: 'complaint',
    title: '这个路口等灯较久',
    description: '晚高峰人多，注意预留时间。',
    latitude: 31.23062,
    longitude: 121.47381,
    score: 1,
    createdAt: 1767175200000,
    isMine: false
  },
  {
    id: 'mock_004',
    category: 'help',
    title: '有人捡到钥匙吗',
    description: '下午在喷泉附近丢失一串钥匙。',
    latitude: 31.23114,
    longitude: 121.47447,
    score: 2,
    createdAt: 1767258000000,
    isMine: false
  },
  {
    id: 'mock_005',
    category: 'discovery',
    title: '咖啡车在这里',
    description: '工作日中午通常会出现。',
    latitude: 31.22991,
    longitude: 121.47296,
    score: 8,
    createdAt: 1767261600000,
    isMine: false
  },
  {
    id: 'mock_006',
    category: 'notice',
    title: '',
    description: '',
    latitude: 31.22986,
    longitude: 121.47291,
    score: 3,
    createdAt: 1767265200000,
    isMine: false
  },
  {
    id: 'mock_007',
    category: 'complaint',
    title: '临时噪音',
    description: '下午有短时设备声。',
    latitude: 31.23131,
    longitude: 121.47317,
    score: -1,
    createdAt: 1767348000000,
    isMine: false
  }
]

function safeGetStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key)
    return value || fallback
  } catch (e) {
    return fallback
  }
}

function safeSetStorage(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (e) {
    wx.showToast({
      title: '本地保存失败',
      icon: 'none'
    })
  }
}

function getCategoryMeta(category) {
  return CATEGORY_MAP[category] || MARK_CATEGORIES[0]
}

function formatCoordinate(value) {
  return Number(value).toFixed(6)
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

function normalizeOwnMarker(marker) {
  return {
    id: marker.id,
    category: marker.category,
    title: marker.title || '',
    description: marker.description || '',
    latitude: marker.latitude,
    longitude: marker.longitude,
    score: Number(marker.score || 0),
    createdAt: marker.createdAt || Date.now(),
    isMine: true
  }
}

function hasValidCoordinate(marker) {
  return marker &&
    typeof marker.latitude === 'number' &&
    typeof marker.longitude === 'number'
}

function buildFilterCategories(activeCategory) {
  return FILTER_CATEGORIES.map(item => Object.assign({}, item, {
    activeClass: item.value === activeCategory ? 'is-active' : ''
  }))
}

function buildMarkCategories(activeCategory) {
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
    activeCategoryLabel: '全部',
    filterCategories: buildFilterCategories('all'),
    markCategories: MARK_CATEGORIES,
    mapMarkers: [],
    ownMarkers: [],
    votes: {},
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
    showCategoryBar: true,
    showPermissionStrip: false,
    selectedClusterKey: '',
    selectedClusterMarkers: [],
    selectedMarkerId: '',
    selectedMarker: null,
    pendingPoint: null,
    form: {
      category: '',
      title: '',
      description: ''
    },
    searchPoint: null,
    highlightMarkerId: ''
  },

  onLoad() {
    this.mapMarkerIdToBusinessId = {}
    this.businessMarkerById = {}
    this.businessIdToMapMarkerId = {}
    this.nextMapMarkerId = 1
    this.currentMapScale = DEFAULT_SCALE
    this.highlightTimer = null
    this.pendingMapTapTimer = null
    this.lastMarkerInteractionAt = 0
    this.clusterPanelTouchStart = null
    this.ensureLocalUser()
    this.loadLocalData()
    this.refreshMapState()
    this.requestCurrentLocation(false)
  },

  onReady() {
    this.mapCtx = wx.createMapContext('markMap', this)
    this.initNativeMarkerCluster()
    this.refreshMapState()
  },

  onUnload() {
    this.clearHighlightTimer()
    this.clearMapTapTimer()
  },

  ensureLocalUser() {
    const savedUserId = safeGetStorage(STORAGE_KEYS.userId, '')
    if (savedUserId) {
      this.localUserId = savedUserId
      return
    }

    const userId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.localUserId = userId
    safeSetStorage(STORAGE_KEYS.userId, userId)
  },

  loadLocalData() {
    const ownMarkers = safeGetStorage(STORAGE_KEYS.ownMarkers, [])
      .filter(marker => marker && marker.id && marker.category && hasValidCoordinate(marker))
      .map(normalizeOwnMarker)
    const votes = safeGetStorage(STORAGE_KEYS.votes, {})

    this.setData({
      ownMarkers,
      votes: votes || {}
    })
  },

  requestCurrentLocation(showFeedback) {
    wx.getLocation({
      type: 'gcj02',
      success: res => {
        const latitude = res.latitude
        const longitude = res.longitude

        this.setData({
          latitude,
          longitude,
          hasLocationAuth: true,
          locationLabel: '已定位到当前位置',
          showPermissionStrip: false
        }, () => {
          this.moveToCurrentLocation()
        })

        if (showFeedback) {
          wx.showToast({
            title: '已更新定位',
            icon: 'success'
          })
        }
      },
      fail: () => {
        this.setData({
          latitude: FALLBACK_CENTER.latitude,
          longitude: FALLBACK_CENTER.longitude,
          scale: DEFAULT_SCALE,
          hasLocationAuth: false,
          locationLabel: '浏览模式：上海人民广场',
          showPermissionStrip: true
        }, () => {
          this.includePoint(FALLBACK_CENTER)
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
          showCategoryBar: true,
          showPermissionStrip: !this.data.hasLocationAuth,
          selectedClusterKey: '',
          selectedClusterMarkers: [],
          selectedMarkerId: '',
          selectedMarker: null
        }, () => {
          this.includePoint(searchPoint)
          this.refreshMapState({ clearSelection: true })
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

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    const categoryLabel = category === 'all' ? '全部' : getCategoryMeta(category).label

    this.setData({
      activeCategory: category,
      activeCategoryLabel: categoryLabel,
      filterCategories: buildFilterCategories(category),
      panelMode: 'browse',
      mapLocateButtonClass: this.getMapLocateButtonClass('browse'),
      clusterPanelExpanded: true,
      clusterPanelStateClass: 'is-expanded',
      showCategoryBar: true,
      showPermissionStrip: !this.data.hasLocationAuth,
      selectedClusterKey: '',
      selectedClusterMarkers: [],
      selectedMarkerId: '',
      selectedMarker: null
    }, () => {
      this.refreshMapState({ clearSelection: true })
    })
  },

  onStartSelectLocationTap() {
    if (!this.data.hasLocationAuth) {
      wx.showToast({
        title: '开启定位后可新增标记',
        icon: 'none'
      })
      return
    }

    wx.chooseLocation({
      success: res => {
        this.startCreateWithPoint({
          latitude: res.latitude,
          longitude: res.longitude,
          title: res.name || '',
          address: res.address || ''
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

  startCreateWithPoint(point) {
    if (!hasValidCoordinate(point)) {
      return
    }

    const title = point.title || ''
    const description = point.address || ''
    const pendingPoint = {
      latitude: point.latitude,
      longitude: point.longitude,
      latitudeText: formatCoordinate(point.latitude),
      longitudeText: formatCoordinate(point.longitude),
      name: title || '当前选点',
      address: description
    }

    this.setData({
      panelMode: 'form',
      mapLocateButtonClass: this.getMapLocateButtonClass('form'),
      clusterPanelExpanded: true,
      clusterPanelStateClass: 'is-expanded',
      showCategoryBar: false,
      showPermissionStrip: false,
      pendingPoint,
      selectedClusterKey: '',
      selectedClusterMarkers: [],
      selectedMarkerId: '',
      selectedMarker: null,
      markCategories: MARK_CATEGORIES,
      form: {
        category: '',
        title,
        description
      }
    }, () => {
      this.refreshMapState({ clearSelection: true, panelMode: 'form' })
    })
  },

  onCancelCreateTap() {
    this.setData({
      panelMode: 'browse',
      mapLocateButtonClass: this.getMapLocateButtonClass('browse'),
      clusterPanelExpanded: true,
      clusterPanelStateClass: 'is-expanded',
      showCategoryBar: true,
      showPermissionStrip: !this.data.hasLocationAuth,
      pendingPoint: null,
      markCategories: MARK_CATEGORIES,
      form: {
        category: '',
        title: '',
        description: ''
      }
    }, () => {
      this.refreshMapState({ clearSelection: true })
    })
  },

  onFormCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      markCategories: buildMarkCategories(category),
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

  onSaveMarkerTap() {
    const pendingPoint = this.data.pendingPoint
    const form = this.data.form

    if (!pendingPoint) {
      return
    }

    if (!form.category) {
      wx.showToast({
        title: '请选择分类',
        icon: 'none'
      })
      return
    }

    const marker = {
      id: `own_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      category: form.category,
      title: (form.title || '').trim(),
      description: (form.description || '').trim(),
      latitude: pendingPoint.latitude,
      longitude: pendingPoint.longitude,
      score: 0,
      createdAt: Date.now(),
      isMine: true
    }

    const ownMarkers = this.data.ownMarkers.concat(marker)
    safeSetStorage(STORAGE_KEYS.ownMarkers, ownMarkers.map(normalizeOwnMarker))

    this.setData({
      ownMarkers,
      pendingPoint: null,
      showCategoryBar: true,
      showPermissionStrip: !this.data.hasLocationAuth,
      markCategories: MARK_CATEGORIES,
      form: {
        category: '',
        title: '',
        description: ''
      },
      clusterPanelExpanded: true,
      clusterPanelStateClass: 'is-expanded',
      highlightMarkerId: marker.id
    }, () => {
      this.refreshMapState({
        clearSelection: true
      })
      this.showMarkerGroupByBusinessIds([marker.id])
      this.startHighlightTimer()
      wx.showToast({
        title: '已创建标记',
        icon: 'success'
      })
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

    if (markerId === PENDING_MARKER_ID) {
      return
    }

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
    if (e.type === 'end' && scale > 0) {
      this.currentMapScale = scale
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

    const voteValue = Number(e.currentTarget.dataset.vote)
    const votes = Object.assign({}, this.data.votes)

    if (votes[selectedMarker.id] === voteValue) {
      delete votes[selectedMarker.id]
    } else {
      votes[selectedMarker.id] = voteValue
    }

    const isCancel = votes[selectedMarker.id] === undefined

    safeSetStorage(STORAGE_KEYS.votes, votes)
    
    if (isCancel) {
      this.setData({
        votes,
        longPressedMarkerId: ''
      }, () => {
        this.refreshMapState({
          selectedMarkerId: selectedMarker.id,
          panelMode: 'cluster'
        })
      })
    } else {
      this.setData({
        votes,
        animatingVoteValue: voteValue
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

        const ownMarkers = this.data.ownMarkers.filter(marker => marker.id !== selectedMarker.id)
        const votes = Object.assign({}, this.data.votes)
        delete votes[selectedMarker.id]

        safeSetStorage(STORAGE_KEYS.ownMarkers, ownMarkers.map(normalizeOwnMarker))
        safeSetStorage(STORAGE_KEYS.votes, votes)

        this.setData({
          ownMarkers,
          votes,
          highlightMarkerId: this.data.highlightMarkerId === selectedMarker.id ? '' : this.data.highlightMarkerId
        }, () => {
          this.refreshMapState({
            clearSelection: true
          })
        })
      }
    })
  },

  onReportTap() {
    wx.showToast({
      title: '已收到举报，原型暂不提交',
      icon: 'none'
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
        this.debugMapLog('initMarkerCluster success', res)
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
    this.debugMapLog('markerClusterClick', res)
    this.showMarkerGroupByMapIds(this.getMarkerIdsFromCluster(cluster))
  },

  refreshMapState(options) {
    const opts = options || {}
    const displayMarkers = this.getDisplayMarkers()
    const mapMarkers = this.buildNativeMapMarkers(displayMarkers)

    if (this.data.pendingPoint) {
      mapMarkers.push(this.createSpecialMarker(PENDING_MARKER_ID, this.data.pendingPoint, '+', '#2563eb', 90))
    }

    if (this.data.highlightMarkerId) {
      const highlightedMarker = displayMarkers.find(marker => marker.id === this.data.highlightMarkerId)
      if (highlightedMarker) {
        mapMarkers.push(this.createSpecialMarker(HIGHLIGHT_MARKER_ID, highlightedMarker, '新', '#0f766e', 95))
      }
    }

    this.updateNativeMapMarkers(mapMarkers)

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

    const mapMarkers = displayMarkers.map(marker => {
      const mapMarkerId = this.getStableMapMarkerId(marker.id)
      mapMarkerIdToBusinessId[mapMarkerId] = marker.id
      businessMarkerById[marker.id] = marker

      return {
        id: mapMarkerId,
        latitude: marker.latitude,
        longitude: marker.longitude,
        iconPath: MARKER_DOT_ICON,
        width: 32,
        height: 32,
        joinCluster: true
      }
    })

    this.mapMarkerIdToBusinessId = mapMarkerIdToBusinessId
    this.businessMarkerById = businessMarkerById

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

    this.setData(updateData)
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
    if (panelMode === 'form') {
      return 'map-locate-button is-above-form-panel'
    }

    if (panelMode === 'cluster') {
      return clusterPanelExpanded === false ?
        'map-locate-button is-above-collapsed-panel' :
        'map-locate-button is-above-cluster-panel'
    }

    return 'map-locate-button'
  },

  getDisplayMarkers() {
    const votes = this.data.votes || {}
    const allMarkers = MOCK_MARKERS.concat(this.data.ownMarkers.map(normalizeOwnMarker))
    const activeCategory = this.data.activeCategory

    return allMarkers
      .filter(marker => activeCategory === 'all' || marker.category === activeCategory)
      .map(marker => this.decorateMarker(marker, votes))
  },

  decorateMarker(marker, votes) {
    const categoryMeta = getCategoryMeta(marker.category)
    const title = (marker.title || '').trim()
    const description = (marker.description || '').trim()
    const voteValue = Number(votes[marker.id] || 0)
    const displayScore = Number(marker.score || 0) + voteValue

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
      voteValue,
      isLiked: voteValue === 1,
      isDisliked: voteValue === -1,
      likeButtonClass: voteValue === 1 ? 'vote-button is-active' : 'vote-button',
      dislikeButtonClass: voteValue === -1 ? 'vote-button is-active' : 'vote-button'
    }
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
  }
})

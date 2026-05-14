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
const GRID_SIZE_METERS = 20
const METERS_PER_LATITUDE = 111320
const NEW_MARKER_HIGHLIGHT_MS = 4000
const MARKER_TAP_FALLBACK_RADIUS_METERS = 45
const PENDING_MARKER_ID = 900001
const HIGHLIGHT_MARKER_ID = 900002
const MARKER_ICON = '/assets/marker-transparent.png'

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

function getGridKey(marker) {
  const latCell = Math.floor(marker.latitude * METERS_PER_LATITUDE / GRID_SIZE_METERS)
  const lngMeters = METERS_PER_LATITUDE * Math.cos(marker.latitude * Math.PI / 180)
  const lngCell = Math.floor(marker.longitude * lngMeters / GRID_SIZE_METERS)
  return `${latCell}:${lngCell}`
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

function getClusterSize(count) {
  if (count >= 7) {
    return 44
  }
  if (count >= 3) {
    return 38
  }
  return 32
}

function buildClusters(markers) {
  const clusterMap = {}

  markers.forEach(marker => {
    const key = getGridKey(marker)
    if (!clusterMap[key]) {
      clusterMap[key] = {
        key,
        latitudeTotal: 0,
        longitudeTotal: 0,
        markers: []
      }
    }

    clusterMap[key].latitudeTotal += marker.latitude
    clusterMap[key].longitudeTotal += marker.longitude
    clusterMap[key].markers.push(marker)
  })

  return Object.keys(clusterMap).map(key => {
    const cluster = clusterMap[key]
    const count = cluster.markers.length
    return {
      key,
      count,
      latitude: cluster.latitudeTotal / count,
      longitude: cluster.longitudeTotal / count,
      markers: cluster.markers
    }
  })
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
    browseTitle: '点击地图标记查看详情',
    browseSubtitle: '',
    panelMode: 'browse',
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
    this.markerIdToClusterKey = {}
    this.clusterByKey = {}
    this.highlightTimer = null
    this.ensureLocalUser()
    this.loadLocalData()
    this.refreshMapState()
    this.requestCurrentLocation(false)
  },

  onReady() {
    this.mapCtx = wx.createMapContext('markMap', this)
  },

  onUnload() {
    this.clearHighlightTimer()
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
          scale: DEFAULT_SCALE,
          hasLocationAuth: true,
          locationLabel: '已定位到当前位置',
          showPermissionStrip: false
        }, () => {
          this.includePoint({ latitude, longitude })
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
      highlightMarkerId: marker.id
    }, () => {
      this.refreshMapState({
        selectedMarkerId: marker.id,
        panelMode: 'cluster'
      })
      this.startHighlightTimer()
      wx.showToast({
        title: '已创建标记',
        icon: 'success'
      })
    })
  },

  onMarkerTap(e) {
    const markerId = this.getMarkerEventId(e)

    if (markerId === PENDING_MARKER_ID) {
      return
    }

    if (markerId === HIGHLIGHT_MARKER_ID && this.data.highlightMarkerId) {
      this.refreshMapState({
        selectedMarkerId: this.data.highlightMarkerId,
        panelMode: 'cluster'
      })
      return
    }

    const clusterKey = this.markerIdToClusterKey[markerId]
    if (clusterKey) {
      this.selectCluster(clusterKey)
    }
  },

  onMapTap(e) {
    if (this.data.panelMode === 'form') {
      return
    }

    const point = e.detail
    if (!hasValidCoordinate(point)) {
      return
    }

    const clusterKey = this.findNearestClusterKey(point)
    if (clusterKey) {
      this.selectCluster(clusterKey)
    }
  },

  onMarkerListItemTap(e) {
    const markerId = e.currentTarget.dataset.id
    const marker = this.data.selectedClusterMarkers.find(item => item.id === markerId)
    if (!marker) {
      return
    }

    const selectedClusterMarkers = this.withSelectedListItemClass(this.data.selectedClusterMarkers, markerId)

    this.setData({
      selectedMarkerId: markerId,
      selectedMarker: selectedClusterMarkers.find(item => item.id === markerId),
      selectedClusterMarkers
    })
  },

  onVoteTap(e) {
    if (!this.data.hasLocationAuth) {
      wx.showToast({
        title: '开启定位后可评价',
        icon: 'none'
      })
      return
    }

    const selectedMarker = this.data.selectedMarker
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

    safeSetStorage(STORAGE_KEYS.votes, votes)
    this.setData({
      votes
    }, () => {
      this.refreshMapState({
        selectedClusterKey: this.data.selectedClusterKey,
        selectedMarkerId: selectedMarker.id,
        panelMode: 'cluster'
      })
    })
  },

  onDeleteMarkerTap() {
    const selectedMarker = this.data.selectedMarker
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
            selectedClusterKey: this.data.selectedClusterKey,
            panelMode: 'cluster'
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

  refreshMapState(options) {
    const opts = options || {}
    const displayMarkers = this.getDisplayMarkers()
    const clusters = buildClusters(displayMarkers)
    const markerIdToClusterKey = {}
    const clusterByKey = {}

    const mapMarkers = clusters.map((cluster, index) => {
      const markerId = index + 1
      const color = getClusterColor(cluster.count)
      const size = getClusterSize(cluster.count)

      markerIdToClusterKey[markerId] = cluster.key
      clusterByKey[cluster.key] = cluster

      return {
        id: markerId,
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        iconPath: MARKER_ICON,
        width: size,
        height: size,
        zIndex: 20 + cluster.count,
        label: {
          content: `${cluster.count}`,
          color: '#ffffff',
          fontSize: 13,
          bgColor: color,
          borderRadius: size / 2,
          padding: 8,
          textAlign: 'center',
          anchorX: -size / 2,
          anchorY: -size / 2
        }
      }
    })

    if (this.data.pendingPoint) {
      mapMarkers.push(this.createSpecialMarker(PENDING_MARKER_ID, this.data.pendingPoint, '+', '#2563eb', 90))
    }

    if (this.data.highlightMarkerId) {
      const highlightedMarker = displayMarkers.find(marker => marker.id === this.data.highlightMarkerId)
      if (highlightedMarker) {
        mapMarkers.push(this.createSpecialMarker(HIGHLIGHT_MARKER_ID, highlightedMarker, '新', '#0f766e', 95))
      }
    }

    this.markerIdToClusterKey = markerIdToClusterKey
    this.clusterByKey = clusterByKey

    let selectedClusterKey = opts.clearSelection ? '' : (opts.selectedClusterKey || this.data.selectedClusterKey)
    let selectedMarkerId = opts.clearSelection ? '' : (opts.selectedMarkerId || this.data.selectedMarkerId)

    if (opts.selectedMarkerId) {
      selectedClusterKey = this.findClusterKeyByMarkerId(opts.selectedMarkerId, clusters)
    }

    const selectedCluster = selectedClusterKey ? clusterByKey[selectedClusterKey] : null
    const updateData = {
      mapMarkers,
      visibleMarkerCount: displayMarkers.length,
      clusterCount: clusters.length,
      browseTitle: displayMarkers.length ? '点击地图标记查看详情' : '当前分类暂无标记',
      browseSubtitle: displayMarkers.length ?
        `当前显示 ${displayMarkers.length} 条标记，聚合为 ${clusters.length} 个区域。` :
        '可切换分类、搜索位置，或开启定位后新增标记。'
    }

    if (selectedCluster) {
      const selectedClusterMarkers = this.sortMarkersForList(selectedCluster.markers)
      let selectedMarker = selectedClusterMarkers.find(marker => marker.id === selectedMarkerId)
      if (!selectedMarker) {
        selectedMarker = selectedClusterMarkers[0] || null
        selectedMarkerId = selectedMarker ? selectedMarker.id : ''
      }
      const decoratedClusterMarkers = this.withSelectedListItemClass(selectedClusterMarkers, selectedMarkerId)
      selectedMarker = decoratedClusterMarkers.find(marker => marker.id === selectedMarkerId) || null

      updateData.panelMode = opts.panelMode || 'cluster'
      updateData.selectedClusterKey = selectedClusterKey
      updateData.selectedClusterMarkers = decoratedClusterMarkers
      updateData.selectedMarkerId = selectedMarkerId
      updateData.selectedMarker = selectedMarker
    } else if (opts.clearSelection || this.data.panelMode === 'cluster' || opts.panelMode === 'cluster') {
      updateData.panelMode = opts.panelMode === 'cluster' ? 'browse' : (opts.panelMode || 'browse')
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
      iconPath: MARKER_ICON,
      width: 36,
      height: 36,
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

  selectCluster(clusterKey) {
    const cluster = this.clusterByKey[clusterKey]
    if (!cluster) {
      return
    }

    const selectedClusterMarkers = this.sortMarkersForList(cluster.markers)
    const selectedMarker = selectedClusterMarkers[0] || null
    const selectedMarkerId = selectedMarker ? selectedMarker.id : ''
    const decoratedClusterMarkers = this.withSelectedListItemClass(selectedClusterMarkers, selectedMarkerId)

    this.setData({
      panelMode: 'cluster',
      selectedClusterKey: clusterKey,
      selectedClusterMarkers: decoratedClusterMarkers,
      selectedMarkerId,
      selectedMarker: decoratedClusterMarkers[0] || null
    })
  },

  getMarkerEventId(e) {
    const detail = e.detail || {}
    const markerId = detail.markerId === undefined ? e.markerId : detail.markerId
    return Number(markerId)
  },

  findNearestClusterKey(point) {
    let nearestClusterKey = ''
    let nearestDistance = Infinity

    Object.keys(this.clusterByKey || {}).forEach(clusterKey => {
      const cluster = this.clusterByKey[clusterKey]
      const distance = getDistanceMeters(point, cluster)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestClusterKey = clusterKey
      }
    })

    return nearestDistance <= MARKER_TAP_FALLBACK_RADIUS_METERS ? nearestClusterKey : ''
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

  findClusterKeyByMarkerId(markerId, clusters) {
    for (let i = 0; i < clusters.length; i += 1) {
      const cluster = clusters[i]
      for (let j = 0; j < cluster.markers.length; j += 1) {
        if (cluster.markers[j].id === markerId) {
          return cluster.key
        }
      }
    }
    return ''
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
  }
})

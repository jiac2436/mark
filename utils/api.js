const { API_BASE_URL } = require('../config/api')

const TOKEN_KEY = 'map_mark_api_token'

let loginPromise = null

function getToken() {
  try {
    return wx.getStorageSync(TOKEN_KEY) || ''
  } catch (e) {
    return ''
  }
}

function setToken(token) {
  try {
    wx.setStorageSync(TOKEN_KEY, token)
  } catch (e) {
    // token 写入失败时让本次请求继续，后续 401 会重新登录。
  }
}

function clearToken() {
  try {
    wx.removeStorageSync(TOKEN_KEY)
  } catch (e) {
    // ignore
  }
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: res => {
        if (res.code) {
          resolve(res.code)
          return
        }

        reject(new Error('微信登录失败'))
      },
      fail: () => {
        reject(new Error('微信登录失败'))
      }
    })
  })
}

function rawRequest(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${options.path}`,
      method: options.method || 'GET',
      data: options.data || undefined,
      header: options.header || {},
      success: res => {
        const data = res.data || {}
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
          return
        }

        reject(new Error(data.message || `请求失败：${res.statusCode}`))
      },
      fail: () => {
        reject(new Error('网络请求失败'))
      }
    })
  })
}

function login() {
  if (loginPromise) {
    return loginPromise
  }

  loginPromise = wxLogin()
    .then(code => rawRequest({
      path: '/api/auth/wechat-login',
      method: 'POST',
      data: { code }
    }))
    .then(data => {
      if (!data.token) {
        throw new Error('登录响应无效')
      }

      setToken(data.token)
      return data
    })
    .then(
      data => {
        loginPromise = null
        return data
      },
      error => {
        loginPromise = null
        throw error
      }
    )

  return loginPromise
}

function buildQuery(params) {
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')
}

function request(options, retry) {
  const shouldRetry = retry !== false
  const token = getToken()

  const ensureToken = token ? Promise.resolve(token) : login().then(() => getToken())

  return ensureToken
    .then(currentToken => rawRequest(Object.assign({}, options, {
      header: Object.assign({}, options.header || {}, {
        Authorization: `Bearer ${currentToken}`
      })
    })))
    .catch(error => {
      if (!shouldRetry || error.message.indexOf('未登录') === -1 && error.message.indexOf('登录') === -1) {
        throw error
      }

      clearToken()
      return login().then(() => request(options, false))
    })
}

function fetchMarkers(params) {
  const query = buildQuery(params)
  return request({
    path: `/api/markers${query ? `?${query}` : ''}`
  })
}

function createMarker(data) {
  return request({
    path: '/api/markers',
    method: 'POST',
    data
  })
}

function validateMarkerLocation(data) {
  return request({
    path: '/api/markers/validate-location',
    method: 'POST',
    data
  })
}

function deleteMarker(id) {
  return request({
    path: `/api/markers/${encodeURIComponent(id)}`,
    method: 'DELETE'
  })
}

function voteMarker(id, value) {
  return request({
    path: `/api/markers/${encodeURIComponent(id)}/vote`,
    method: 'PUT',
    data: { value }
  })
}

function reportMarker(id, reason) {
  return request({
    path: `/api/markers/${encodeURIComponent(id)}/report`,
    method: 'POST',
    data: {
      reason: reason || ''
    }
  })
}

module.exports = {
  login,
  fetchMarkers,
  createMarker,
  validateMarkerLocation,
  deleteMarker,
  voteMarker,
  reportMarker
}

/**
 * IP / 地理定位
 * 商业源一律走同源 /api 代理，浏览器永不接触 key
 * 带缓存与并发去重，避免频繁刷新
 */

import { fetchJson } from './http'
import { sanitizeError, truncateCoord } from '../utils/safe'
import { guardedRequest } from '../utils/requestGuard'

const LOC_TTL = 15 * 60 * 1000 // 定位 15 分钟内复用
const LOC_ERR_TTL = 30 * 1000

async function locateByAmap() {
  const data = await fetchJson('/api/amap/v3/ip', { timeout: 7000 })
  if (String(data.status) !== '1') {
    throw new Error('amap')
  }

  let lat = null
  let lon = null
  if (typeof data.rectangle === 'string' && data.rectangle.includes(';')) {
    const [a, b] = data.rectangle.split(';')
    const [minLon, minLat] = a.split(',').map(Number)
    const [maxLon, maxLat] = b.split(',').map(Number)
    if ([minLon, minLat, maxLon, maxLat].every(Number.isFinite)) {
      lon = (minLon + maxLon) / 2
      lat = (minLat + maxLat) / 2
    }
  }

  const city = Array.isArray(data.city) ? '' : data.city || ''
  const province = Array.isArray(data.province) ? '' : data.province || ''
  const adcode = Array.isArray(data.adcode) ? '' : data.adcode || ''

  if (!city && !province && lat == null) throw new Error('amap empty')

  return {
    source: 'amap',
    city: city || province || '未知',
    province,
    adcode: adcode || '',
    lat: truncateCoord(lat),
    lon: truncateCoord(lon),
  }
}

async function locateByIpWho() {
  const data = await fetchJson('https://ipwho.is/', { timeout: 7000 })
  if (!data.success) throw new Error('ipwho')
  return {
    source: 'ipwho',
    city: data.city || data.region || '未知',
    province: data.region || '',
    adcode: '',
    lat: truncateCoord(data.latitude),
    lon: truncateCoord(data.longitude),
  }
}

async function locateByBrowser() {
  if (!navigator.geolocation) throw new Error('geo unsupported')
  const pos = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 7000,
      maximumAge: 600000,
    })
  })
  return {
    source: 'geo',
    city: '当前位置',
    province: '',
    adcode: '',
    lat: truncateCoord(pos.coords.latitude),
    lon: truncateCoord(pos.coords.longitude),
  }
}

async function detectLocationOnce() {
  const chain = [locateByAmap, locateByIpWho, locateByBrowser]
  let last = 'locate'

  for (const fn of chain) {
    try {
      return await fn()
    } catch (e) {
      last = sanitizeError(e, 'locate')
    }
  }

  throw new Error(last)
}

export async function detectLocation(options = {}) {
  return guardedRequest('loc:primary', detectLocationOnce, {
    ttlMs: LOC_TTL,
    errorTtlMs: LOC_ERR_TTL,
    force: Boolean(options.force),
  })
}

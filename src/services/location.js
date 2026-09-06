/**
 * 定位：真实优先，网络兜底
 *
 * 0) 浏览器 GPS —— 已授权时静默使用；用户点击城市名可显式请求（真实坐标 → 最近站点空气）
 * 1) ipwho / ipip 抢城市（ipwho 常带坐标）
 * 2) 双双失败 → 高德 IP 定位（同源代理；代理注入服务端可见的客户端 IPv4）补中文名 + 矩形中心
 * 3) 有可信城市名 → 高德地理编码 city → lat/lon（失败再试高德 IP / 城市中心表）
 *
 * 注意：浏览器直连会撞 CORS 的源一律不走（如太平洋 IP）。
 * 严禁把 null 坐标写成 0,0（会打到 Null Island，空气读数全 0）
 */

import { fetchJson } from './http'
import { isValidCoord, truncateCoord } from '../utils/safe'
import { guardedRequest, clearRequestCache } from '../utils/requestGuard'
import { cleanCityName } from '../utils/city'

const LOC_TTL = 15 * 60 * 1000
const LOC_ERR_TTL = 25 * 1000
const LOC_CACHE_KEY = 'loc:primary'

const T = {
  ipip: 2200,
  ipwho: 2200,
  amap: 2600,
  geocode: 2600,
  race: 2600,
  /** 已授权时的静默 GPS：短等，超时无感回落 IP */
  gps: 3500,
  /** 用户显式请求精确定位：允许等系统权限弹窗 + 首次定位 */
  gpsExplicit: 12000,
}

/** GPS 展示占位：placeName 会逆地理成真实地名 */
const GPS_PLACEHOLDER = '当前位置'

function asText(v) {
  if (v == null) return ''
  if (Array.isArray(v)) return ''
  return String(v).trim()
}

function isIpv4(ip) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip || ''))
}

function buildLoc({ source, city, province = '', adcode = '', lat, lon, ip = '' }) {
  const la = truncateCoord(lat)
  const lo = truncateCoord(lon)
  const ok = isValidCoord(la, lo)
  return {
    source,
    city: cleanCityName(city) || cleanCityName(province) || '未知',
    province: asText(province).replace(/省$/, ''),
    adcode: asText(adcode),
    lat: ok ? la : null,
    lon: ok ? lo : null,
    ip: asText(ip),
  }
}

function hasCity(loc) {
  return Boolean(loc && loc.city && loc.city !== '未知')
}

function hasCoords(loc) {
  return loc && isValidCoord(loc.lat, loc.lon)
}

function usable(loc) {
  return hasCity(loc) && hasCoords(loc)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 地理定位权限状态：granted | prompt | denied | unknown */
export async function getGeoPermissionState() {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
    const st = await navigator.permissions.query({ name: 'geolocation' })
    return st?.state || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * 浏览器 GPS：真实坐标（explicit 时可触发系统权限弹窗，须在用户手势内调用）
 * @param {{ explicit?: boolean }} [opts]
 */
function fromBrowserGeolocation({ explicit = false } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = buildLoc({
          source: 'gps',
          city: GPS_PLACEHOLDER,
          lat: pos?.coords?.latitude,
          lon: pos?.coords?.longitude,
        })
        if (!hasCoords(loc)) {
          reject(new Error('gps coords'))
          return
        }
        resolve(loc)
      },
      (err) => reject(new Error(err?.message || 'gps denied')),
      {
        enableHighAccuracy: explicit,
        timeout: explicit ? T.gpsExplicit : T.gps,
        maximumAge: 5 * 60 * 1000,
      },
    )
  })
}

/** ipip.net：国内城市通常较准；可能无 CORS，失败则忽略 */
async function fromIpip() {
  const data = await fetchJson('https://myip.ipip.net/json', { timeout: T.ipip })
  if (asText(data.ret) !== 'ok' || !data.data) throw new Error('ipip')
  const locArr = Array.isArray(data.data.location) ? data.data.location : []
  const province = asText(locArr[1])
  const city = asText(locArr[2]) || province
  const ip = asText(data.data.ip)
  if (!city) throw new Error('ipip empty')
  return buildLoc({
    source: 'ipip',
    city,
    province,
    ip,
  })
}

/** ipwho：一把梭 IP+城市+坐标；国内 IPv6 城市可能偏，仅作线索 */
async function fromIpWho() {
  const data = await fetchJson('https://ipwho.is/', { timeout: T.ipwho })
  if (!data?.success) throw new Error('ipwho')
  return buildLoc({
    source: 'ipwho',
    city: data.city || data.region || '未知',
    province: data.region || '',
    lat: data.latitude,
    lon: data.longitude,
    ip: data.ip,
  })
}

/**
 * 高德 IP 定位：有明确 IPv4 时用之；不传则由代理注入请求方 IP
 * （代理从 CF-Connecting-IP / x-real-ip / X-Forwarded-For 提取，见 server/proxy.mjs）
 */
async function fromAmapIp(ip = '') {
  if (ip && !isIpv4(ip)) throw new Error('amap needs ipv4')
  const qs = ip ? `?ip=${encodeURIComponent(ip)}` : ''
  const data = await fetchJson(`/api/amap/v3/ip${qs}`, {
    timeout: T.amap,
  })
  if (String(data.status) !== '1') throw new Error(asText(data.info) || 'amap')

  let lat = null
  let lon = null
  const rect = asText(data.rectangle)
  if (rect.includes(';')) {
    const [a, b] = rect.split(';')
    const [minLon, minLat] = a.split(',').map(Number)
    const [maxLon, maxLat] = b.split(',').map(Number)
    if ([minLon, minLat, maxLon, maxLat].every(Number.isFinite)) {
      lon = (minLon + maxLon) / 2
      lat = (minLat + maxLat) / 2
    }
  }

  const city = asText(data.city)
  const province = asText(data.province)
  const adcode = asText(data.adcode)
  const loc = buildLoc({
    source: 'amap',
    city: city || province || '未知',
    province,
    adcode,
    lat,
    lon,
    ip,
  })
  if (!hasCity(loc)) throw new Error('amap empty')
  return loc
}

async function geocodeCity(city, province = '') {
  const q = [province, city].filter(Boolean).join('')
  if (!q) throw new Error('geocode empty query')
  const data = await fetchJson(
    `/api/amap/v3/geocode/geo?address=${encodeURIComponent(q)}`,
    { timeout: T.geocode },
  )
  if (String(data.status) !== '1') throw new Error('geocode')
  const g = Array.isArray(data.geocodes) ? data.geocodes[0] : null
  if (!g?.location) throw new Error('geocode empty')
  const [lon, lat] = String(g.location).split(',').map(Number)
  if (!isValidCoord(lat, lon)) throw new Error('geocode coords')
  return {
    lat,
    lon,
    adcode: asText(g.adcode),
    city: asText(g.city) || asText(g.district) || city,
    province: asText(g.province) || province,
  }
}

function preferRank(loc) {
  const table = { amap: 40, ipip: 30, ipwho: 8 }
  let s = table[loc.source] || 10
  if (loc.adcode) s += 8
  if (hasCoords(loc)) s += 5
  // 国内源城市与 ipwho 北京冲突时压低 ipwho
  if (loc.source === 'ipwho' && /beijing|北京/i.test(loc.city || '')) s -= 20
  return s
}

function mergeHints(hints) {
  const list = hints.filter(hasCity)
  if (!list.length) return null
  list.sort((a, b) => preferRank(b) - preferRank(a))
  const best = { ...list[0] }

  const domestic = list.find((h) => h.source === 'ipip' || h.source === 'amap')
  if (domestic) {
    best.city = domestic.city
    best.province = domestic.province || best.province
    best.source = domestic.source
    if (domestic.adcode) best.adcode = domestic.adcode
    // 国内源自带坐标才用；不要拿 ipwho 的北京坐标配「苏州」
    if (hasCoords(domestic)) {
      best.lat = domestic.lat
      best.lon = domestic.lon
    } else {
      best.lat = null
      best.lon = null
      // 标记：城市可信、坐标待地理编码
      best.needsGeocode = true
    }
  }

  for (const h of list) {
    if (!best.adcode && h.adcode) best.adcode = h.adcode
    if (!best.ip && h.ip) best.ip = h.ip
    if (!best.province && h.province) best.province = h.province
    // 非国内城市场景：可用非 ipwho 坐标
    if (!domestic && !hasCoords(best) && hasCoords(h) && h.source !== 'ipwho') {
      best.lat = h.lat
      best.lon = h.lon
    }
  }

  // 仅当没有国内城市线索时，才用 ipwho 坐标
  if (!domestic && !hasCoords(best)) {
    const withCoord = list.find((h) => hasCoords(h))
    if (withCoord) {
      best.lat = withCoord.lat
      best.lon = withCoord.lon
    }
  }

  // 再次清洗，防止 0,0
  if (!isValidCoord(best.lat, best.lon)) {
    best.lat = null
    best.lon = null
  }
  return best
}

/** 主要城市中心（地理编码失败时的最后兜底，非精确定位） */
const CITY_CENTROIDS = {
  北京: [39.9042, 116.4074],
  上海: [31.2304, 121.4737],
  广州: [23.1291, 113.2644],
  深圳: [22.5431, 114.0579],
  杭州: [30.2741, 120.1551],
  成都: [30.5728, 104.0668],
  重庆: [29.563, 106.5516],
  武汉: [30.5928, 114.3055],
  南京: [32.0603, 118.7969],
  天津: [39.3434, 117.3616],
  苏州: [31.2989, 120.5853],
  西安: [34.3416, 108.9398],
  厦门: [24.4798, 118.0894],
  青岛: [36.0671, 120.3826],
  长沙: [28.2282, 112.9388],
  郑州: [34.7466, 113.6254],
  沈阳: [41.8057, 123.4315],
  大连: [38.914, 121.6147],
  昆明: [25.0389, 102.7183],
  合肥: [31.8206, 117.2272],
  福州: [26.0745, 119.2965],
  济南: [36.6512, 117.1201],
  哈尔滨: [45.8038, 126.534],
  香港: [22.3193, 114.1694],
  澳门: [22.1987, 113.5439],
  台北: [25.033, 121.5654],
  Beijing: [39.9042, 116.4074],
  Shanghai: [31.2304, 121.4737],
  Suzhou: [31.2989, 120.5853],
}

function centroidForCity(city) {
  if (!city) return null
  const key = cleanCityName(city)
  const pair = CITY_CENTROIDS[key] || CITY_CENTROIDS[city]
  if (!pair) return null
  return { lat: pair[0], lon: pair[1] }
}

async function ensureCoords(loc) {
  // 国内城市名来自 ipip 但无坐标时，必须地理编码，禁止沿用 ipwho 北京点
  const forceGeo = Boolean(loc.needsGeocode) || !hasCoords(loc)
  if (!forceGeo && usable(loc)) return loc

  // 有可信城市名 → 直接地理编码到该城市中心
  if (loc.city && loc.city !== '未知') {
    try {
      const g = await geocodeCity(loc.city, loc.province)
      return buildLoc({
        source: loc.source === 'ipip' || loc.source === 'amap' ? loc.source : 'geocode',
        city: loc.city || g.city,
        province: loc.province || g.province,
        adcode: loc.adcode || g.adcode,
        lat: g.lat,
        lon: g.lon,
        ip: loc.ip,
      })
    } catch {
      /* fall through */
    }

    // 高德挂了：用城市中心表兜底（保证空气接口仍能请求）
    const c = centroidForCity(loc.city)
    if (c) {
      return buildLoc({
        source: `${loc.source || 'city'}+centroid`,
        city: loc.city,
        province: loc.province,
        adcode: loc.adcode,
        lat: c.lat,
        lon: c.lon,
        ip: loc.ip,
      })
    }
  }

  // 仍无坐标：高德 IP 定位（有 IPv4 用之；否则代理按请求方 IP 注入）
  try {
    const amap = await fromAmapIp(isIpv4(loc.ip) ? loc.ip : '')
    if (usable(amap)) return amap
  } catch {
    /* ignore */
  }

  // 最后：若仍有任意有效坐标则用（可能来自 ipwho）
  if (usable(loc)) return loc
  throw new Error('no coords')
}

async function detectLocationOnce(opts = {}) {
  // 0) 真实 GPS：显式请求时必试；静默流程仅在已授权时试（不打扰用户）
  const explicit = Boolean(opts.precise)
  try {
    const perm = await getGeoPermissionState()
    if (explicit || perm === 'granted') {
      return await fromBrowserGeolocation({ explicit })
    }
  } catch {
    /* 被拒 / 超时 / 不支持 → 回落网络定位 */
  }

  const bag = []
  let lastIpv4 = ''
  const push = (p) =>
    p
      .then((loc) => {
        if (hasCity(loc)) bag.push(loc)
        if (isIpv4(loc?.ip)) lastIpv4 = loc.ip
        return loc
      })
      .catch(() => null)

  // 不请求 pconline：浏览器 CORS 必挂
  const jobs = [push(fromIpip()), push(fromIpWho())]
  await Promise.race([Promise.allSettled(jobs), sleep(T.race)])
  if (!bag.some((h) => h.source === 'ipip')) {
    await Promise.race([Promise.allSettled(jobs), sleep(250)])
  }

  let merged = mergeHints(bag)
  if (!merged) {
    // ipip（浏览器直连常撞 CORS）/ ipwho 双双没给出城市：
    // 还剩代理侧高德 IP 一条线索（代理注入服务端可见的客户端 IPv4）
    try {
      merged = await fromAmapIp(lastIpv4)
    } catch {
      throw new Error('locate empty')
    }
  }

  merged = await ensureCoords(merged)
  if (!usable(merged)) throw new Error('locate incomplete')
  return merged
}

/**
 * @param {{ force?: boolean, precise?: boolean }} [options]
 * precise：用户显式请求 GPS 精确定位（隐含 force，须在用户手势内触发）
 */
export async function detectLocation(options = {}) {
  const precise = Boolean(options.precise)
  const force = Boolean(options.force) || precise
  if (force) clearRequestCache(LOC_CACHE_KEY)
  return guardedRequest(LOC_CACHE_KEY, () => detectLocationOnce({ precise }), {
    ttlMs: LOC_TTL,
    errorTtlMs: LOC_ERR_TTL,
    force,
  })
}

export function clearLocationCache() {
  clearRequestCache(LOC_CACHE_KEY)
}

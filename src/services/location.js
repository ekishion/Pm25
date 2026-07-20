/**
 * 城市级定位（不要求精确、不申请浏览器权限）
 *
 * 注意：浏览器直连会撞 CORS 的源一律不走（如太平洋 IP）。
 * 1) ipwho / ipip 抢城市（ipwho 常带坐标）
 * 2) 有 IPv4 时用高德 IP（同源代理）补中文名 + 矩形中心
 * 3) 仍无有效坐标时用高德地理编码 city → lat/lon
 *
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
}

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

async function fromAmapIp(ip) {
  if (!isIpv4(ip)) throw new Error('amap needs ipv4')
  const data = await fetchJson(`/api/amap/v3/ip?ip=${encodeURIComponent(ip)}`, {
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
    if (hasCoords(domestic)) {
      best.lat = domestic.lat
      best.lon = domestic.lon
    }
  }

  for (const h of list) {
    if (!best.adcode && h.adcode) best.adcode = h.adcode
    if (!hasCoords(best) && hasCoords(h) && h.source !== 'ipwho') {
      best.lat = h.lat
      best.lon = h.lon
    }
    if (!best.ip && h.ip) best.ip = h.ip
    if (!best.province && h.province) best.province = h.province
  }

  // 仍无坐标时，才考虑用 ipwho 的坐标（城市仍用国内源）
  if (!hasCoords(best)) {
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

async function ensureCoords(loc) {
  if (usable(loc)) return loc

  if (loc.ip && isIpv4(loc.ip)) {
    try {
      const amap = await fromAmapIp(loc.ip)
      if (usable(amap)) {
        return buildLoc({
          source: 'amap',
          city: amap.city || loc.city,
          province: amap.province || loc.province,
          adcode: amap.adcode || loc.adcode,
          lat: amap.lat,
          lon: amap.lon,
          ip: loc.ip,
        })
      }
      if (hasCoords(amap)) {
        return buildLoc({
          source: loc.source,
          city: loc.city,
          province: loc.province || amap.province,
          adcode: amap.adcode || loc.adcode,
          lat: amap.lat,
          lon: amap.lon,
          ip: loc.ip,
        })
      }
    } catch {
      /* geocode next */
    }
  }

  try {
    const g = await geocodeCity(loc.city, loc.province)
    return buildLoc({
      source: loc.source,
      city: loc.city || g.city,
      province: loc.province || g.province,
      adcode: loc.adcode || g.adcode,
      lat: g.lat,
      lon: g.lon,
      ip: loc.ip,
    })
  } catch {
    throw new Error('no coords')
  }
}

async function detectLocationOnce() {
  const bag = []
  const push = (p) =>
    p
      .then((loc) => {
        if (hasCity(loc)) bag.push(loc)
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
  if (!merged) throw new Error('locate empty')

  merged = await ensureCoords(merged)
  if (!usable(merged)) throw new Error('locate incomplete')
  return merged
}

export async function detectLocation(options = {}) {
  const force = Boolean(options.force)
  if (force) clearRequestCache(LOC_CACHE_KEY)
  return guardedRequest(LOC_CACHE_KEY, detectLocationOnce, {
    ttlMs: LOC_TTL,
    errorTtlMs: LOC_ERR_TTL,
    force,
  })
}

export function clearLocationCache() {
  clearRequestCache(LOC_CACHE_KEY)
}

/**
 * 城市展示名：用公开地理服务按语言解析，替代手写字典
 *
 * 策略：
 * 1) 有坐标 → 逆地理（BigDataCloud，免 key、CORS 友好、支持 localityLanguage）
 * 2) 仅有名字 → Open-Meteo 地理编码（language=zh|en）
 * 3) 失败 → cleanCityName 兜底
 *
 * 结果按 city|lat,lon|locale 缓存在 sessionStorage
 */

import { fetchJson } from './http'
import { isValidCoord, truncateCoord } from '../utils/safe'
import { cleanCityName } from '../utils/city'

const SS_PREFIX = 'pm25:place:'
const memory = new Map()

function cacheKey({ city, lat, lon, locale }) {
  const la = truncateCoord(lat)
  const lo = truncateCoord(lon)
  const coord =
    isValidCoord(la, lo) ? `${la},${lo}` : ''
  return `${locale || 'zh'}|${coord}|${cleanCityName(city) || city || ''}`
}

function readCache(key) {
  if (memory.has(key)) return memory.get(key)
  try {
    const v = sessionStorage.getItem(SS_PREFIX + key)
    if (v) {
      memory.set(key, v)
      return v
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeCache(key, value) {
  if (!value) return
  memory.set(key, value)
  try {
    sessionStorage.setItem(SS_PREFIX + key, value)
  } catch {
    /* ignore */
  }
}

function pickCityFields(obj) {
  if (!obj || typeof obj !== 'object') return ''
  const candidates = [
    obj.city,
    obj.locality,
    obj.localityName,
    obj.name,
    obj.principalSubdivision,
    obj.admin1,
    obj.countryName,
  ]
  for (const c of candidates) {
    const s = cleanCityName(c)
    if (s) return s
  }
  return ''
}

/**
 * 逆地理：坐标 → 本地化城市名
 * BigDataCloud client endpoint（无需 key）
 */
async function reverseBigDataCloud(lat, lon, locale) {
  const lang = locale === 'en' ? 'en' : 'zh'
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&localityLanguage=${encodeURIComponent(lang)}`
  const data = await fetchJson(url, { timeout: 4500 })
  const name = pickCityFields(data)
  if (!name) throw new Error('bdc empty')
  return name
}

/**
 * 正地理：名称 → 目标语言下的规范名
 * Open-Meteo geocoding
 */
async function searchOpenMeteo(name, locale) {
  const q = cleanCityName(name) || name
  if (!q) throw new Error('empty name')
  const lang = locale === 'en' ? 'en' : 'zh'
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(q)}` +
    `&count=1&language=${encodeURIComponent(lang)}&format=json`
  const data = await fetchJson(url, { timeout: 4500 })
  const hit = Array.isArray(data.results) ? data.results[0] : null
  if (!hit) throw new Error('geo empty')
  // name 已按 language 返回
  const label = cleanCityName(hit.name) || hit.name
  if (!label) throw new Error('geo name')
  return label
}

/**
 * 解析展示用城市名
 * @param {{ city?: string, lat?: number, lon?: number, locale?: 'zh'|'en' }} input
 * @returns {Promise<string>}
 */
export async function resolvePlaceLabel(input = {}) {
  const locale = input.locale === 'en' ? 'en' : 'zh'
  const city = String(input.city || '').trim()
  const lat = truncateCoord(input.lat)
  const lon = truncateCoord(input.lon)
  const key = cacheKey({ city, lat, lon, locale })

  const cached = readCache(key)
  if (cached) return cached

  // 1) 有坐标：逆地理最准（语言由 localityLanguage 控制）
  if (isValidCoord(lat, lon)) {
    try {
      const label = await reverseBigDataCloud(lat, lon, locale)
      writeCache(key, label)
      return label
    } catch {
      /* fall through */
    }
  }

  // 2) 有名字：按目标语言搜索规范名
  if (city && city !== '未知' && city !== '当前位置') {
    try {
      const label = await searchOpenMeteo(city, locale)
      writeCache(key, label)
      return label
    } catch {
      /* fall through */
    }
  }

  // 3) 兜底
  const fallback = cleanCityName(city) || city || ''
  if (fallback) writeCache(key, fallback)
  return fallback
}

/** 测试 / 调试 */
export function clearPlaceNameCache() {
  memory.clear()
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(SS_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

/**
 * 城市展示名：按坐标 / 名称与语言解析，替代手写字典
 *
 * 策略：
 * 1) 有坐标：
 *    - 国内（含港澳台）：高德 regeo（同源代理，国内可达、中文名准）优先，
 *      失败落 BigDataCloud；en locale 反过来（BDC 出本地化名，高德兜底）
 *    - 海外：BigDataCloud（免 key、CORS 友好、支持 localityLanguage）
 * 2) 仅有名字 → Open-Meteo 地理编码（language=zh|en）
 * 3) 失败 → cleanCityName 兜底；兜底结果不写缓存，条件恢复后仍会重试
 *
 * 成功解析的标签按 city|lat,lon|locale 缓存在 sessionStorage
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

/** 中国范围粗判（含港澳台），决定逆地理优先走高德还是 BigDataCloud */
function isInChina(lat, lon) {
  return lat >= 18 && lat <= 54 && lon >= 73 && lon <= 135
}

/**
 * 逆地理：国内坐标 → 中文城市名
 * 高德 regeo（同源代理，需服务端 AMAP_KEY）；直辖市 city 为空时回落 province
 */
async function reverseByAmapRegeo(lat, lon) {
  const loc = `${lon},${lat}`
  const data = await fetchJson(
    `/api/amap/v3/geocode/regeo?location=${encodeURIComponent(loc)}`,
    { timeout: 4500 },
  )
  if (String(data.status) !== '1') throw new Error('regeo')
  const comp = data.regeocode?.addressComponent
  if (!comp) throw new Error('regeo empty')
  const name =
    cleanCityName(comp.city) || cleanCityName(comp.district) || cleanCityName(comp.province)
  if (!name) throw new Error('regeo name')
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

  const hasCoords = isValidCoord(lat, lon)
  const china = hasCoords && isInChina(lat, lon)

  // 1) 有坐标：按地区与语言选逆地理顺序（惰性调用，失败再试下一家）
  if (hasCoords) {
    const attempts =
      china && locale === 'zh'
        ? [
            () => reverseByAmapRegeo(lat, lon),
            () => reverseBigDataCloud(lat, lon, locale),
          ]
        : [
            () => reverseBigDataCloud(lat, lon, locale),
            ...(china ? [() => reverseByAmapRegeo(lat, lon)] : []),
          ]
    for (const attempt of attempts) {
      try {
        const label = await attempt()
        writeCache(key, label)
        return label
      } catch {
        /* fall through */
      }
    }
  }

  // 2) 有名字：按目标语言搜索规范名（跳过占位 / 未知）
  if (city && city !== '未知' && city !== '当前位置') {
    try {
      const label = await searchOpenMeteo(city, locale)
      writeCache(key, label)
      return label
    } catch {
      /* fall through */
    }
  }

  // 3) 兜底：不写缓存 —— 占位符 / 原始名只是临时展示，下次仍应重试解析
  return cleanCityName(city) || city || ''
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

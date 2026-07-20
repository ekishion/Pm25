/**
 * 轻量气象：仅用于火焰/烟雾气质，不展示面板
 * 优先高德（与 IP 同源 key），失败再 Open-Meteo
 */

import { fetchJson } from './http'
import { isValidCoord, truncateCoord } from '../utils/safe'
import { guardedRequest } from '../utils/requestGuard'

const TTL = 20 * 60 * 1000

function normalize(partial) {
  const wind = Number(partial.wind)
  const humidity = Number(partial.humidity)
  return {
    wind: Number.isFinite(wind) ? Math.max(0, wind) : 0,
    humidity: Number.isFinite(humidity) ? Math.min(100, Math.max(0, humidity)) : 50,
    source: partial.source || '',
  }
}

/** 0–1 风偏、烟沉 */
export function weatherToStyle({ wind = 0, humidity = 50 } = {}) {
  // wind m/s 粗归一；humidity 影响烟
  const w = Math.min(1, Math.max(0, wind / 12))
  const h = Math.min(1, Math.max(0, (humidity - 30) / 55))
  return {
    '--wind': String(w),
    '--wind-skew': `${(w * 4).toFixed(2)}deg`,
    '--smoke-weight': String(0.85 + h * 0.35),
    '--smoke-slow': String(1 + h * 0.45),
  }
}

/**
 * 高德风力等级 → 近似 m/s（取区间中值）
 * 文档常见：≤3 / 4 / 5 … 或「3级」
 */
function amapWindToMs(windpower) {
  if (windpower == null || windpower === '') return null
  const s = String(windpower)
  const range = s.match(/(\d+)\s*[-~～]\s*(\d+)/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (Number.isFinite(a) && Number.isFinite(b)) return ((a + b) / 2) * 0.9
  }
  const n = Number((s.match(/(\d+(?:\.\d+)?)/) || [])[1])
  if (!Number.isFinite(n)) return null
  // 蒲福风级粗映射
  if (n <= 12) {
    const beaufort = [0.1, 1, 2.5, 4.5, 6.5, 9, 12, 15, 18.5, 22, 26, 30, 34]
    return beaufort[Math.min(12, Math.round(n))] ?? n
  }
  return n
}

/** 高德实时天气：需要城市 adcode（IP 接口已带回） */
async function fromAmap(adcode) {
  const code = String(adcode || '').trim()
  if (!code || code === '[]') throw new Error('amap adcode')
  const data = await fetchJson(
    `/api/amap/v3/weather/weatherInfo?city=${encodeURIComponent(code)}&extensions=base`,
    { timeout: 7000 },
  )
  if (String(data.status) !== '1') throw new Error('amap weather')
  const live = Array.isArray(data.lives) ? data.lives[0] : null
  if (!live) throw new Error('amap weather empty')
  const wind = amapWindToMs(live.windpower)
  const humidity = Number(live.humidity)
  if (wind == null && !Number.isFinite(humidity)) throw new Error('amap weather fields')
  return normalize({
    wind: wind ?? 0,
    humidity: Number.isFinite(humidity) ? humidity : 50,
    source: 'amap',
  })
}

async function fromOpenMeteo(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&current=wind_speed_10m,relative_humidity_2m`
  const data = await fetchJson(url, { timeout: 7000 })
  const cur = data.current
  if (!cur) throw new Error('weather')
  return normalize({
    wind: cur.wind_speed_10m,
    humidity: cur.relative_humidity_2m,
    source: 'meteo',
  })
}

async function fetchWeatherOnce({ lat, lon, adcode }) {
  if (adcode) {
    try {
      return await fromAmap(adcode)
    } catch {
      /* fall through */
    }
  }
  if (isValidCoord(lat, lon)) {
    return fromOpenMeteo(lat, lon)
  }
  return normalize({})
}

/**
 * @param {{ lat?: number, lon?: number, adcode?: string, force?: boolean }} opts
 */
export async function fetchWeather({ lat, lon, adcode = '', force = false } = {}) {
  const la = truncateCoord(lat)
  const lo = truncateCoord(lon)
  const code = String(adcode || '').trim()
  if (!isValidCoord(la, lo) && !code) {
    return normalize({})
  }
  const key = code
    ? `wx:adcode:${code}`
    : `wx:${la},${lo}`
  try {
    return await guardedRequest(key, () => fetchWeatherOnce({ lat: la, lon: lo, adcode: code }), {
      ttlMs: TTL,
      errorTtlMs: 40 * 1000,
      force,
    })
  } catch {
    return normalize({})
  }
}

/**
 * 轻量气象：仅用于火焰/烟雾气质，不展示面板
 */

import { fetchJson } from './http'
import { truncateCoord } from '../utils/safe'
import { guardedRequest } from '../utils/requestGuard'

const TTL = 20 * 60 * 1000

function normalize(partial) {
  const wind = Number(partial.wind)
  const humidity = Number(partial.humidity)
  return {
    wind: Number.isFinite(wind) ? Math.max(0, wind) : 0,
    humidity: Number.isFinite(humidity) ? Math.min(100, Math.max(0, humidity)) : 50,
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
  })
}

export async function fetchWeather({ lat, lon, force = false } = {}) {
  const la = truncateCoord(lat)
  const lo = truncateCoord(lon)
  if (la == null || lo == null) {
    return normalize({})
  }
  try {
    return await guardedRequest(
      `wx:${la},${lo}`,
      () => fromOpenMeteo(la, lo),
      { ttlMs: TTL, errorTtlMs: 40 * 1000, force },
    )
  } catch {
    return normalize({})
  }
}

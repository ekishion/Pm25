/**
 * 空气质量
 * 含密钥源：仅 /api/* 同源代理
 * 公开源：Open-Meteo（无密钥）
 * 带缓存 / 冷却 / 并发去重
 */

import { approxCnAqiFromUs } from '../utils/aqi'
import { fetchJson } from './http'
import { sanitizeError, truncateCoord } from '../utils/safe'
import { guardedRequest } from '../utils/requestGuard'

const AIR_TTL = 5 * 60 * 1000 // 空气质量 5 分钟缓存
const AIR_ERR_TTL = 25 * 1000

function normalize(partial) {
  const aqi = Number(partial.aqi)
  const pm25 = Number(partial.pm25)
  const pm10 = Number(partial.pm10)
  return {
    aqi: Number.isFinite(aqi) ? Math.round(aqi) : null,
    pm25: Number.isFinite(pm25) ? Math.round(pm25 * 10) / 10 : null,
    pm10: Number.isFinite(pm10) ? Math.round(pm10 * 10) / 10 : null,
    source: partial.source || '',
    updatedAt: partial.updatedAt || new Date().toISOString(),
  }
}

async function fromCaiyun(lat, lon) {
  const path = `/${lon},${lat}/realtime.json`
  const data = await fetchJson(`/api/caiyun${path}`, { timeout: 8000 })
  if (data.status && data.status !== 'ok') throw new Error('caiyun')

  const aq = data.result?.realtime?.air_quality
  if (!aq) throw new Error('caiyun empty')

  let aqi = null
  if (typeof aq.aqi === 'number') aqi = aq.aqi
  else if (aq.aqi && typeof aq.aqi.chn === 'number') aqi = aq.aqi.chn
  else if (aq.aqi && typeof aq.aqi.usa === 'number') aqi = aq.aqi.usa

  return normalize({
    aqi,
    pm25: aq.pm25,
    pm10: aq.pm10,
    source: 'caiyun',
    updatedAt: data.server_time
      ? new Date(data.server_time * 1000).toISOString()
      : undefined,
  })
}

async function fromWaqi(lat, lon) {
  const url = `/api/waqi/feed/geo:${lat};${lon}/`
  const data = await fetchJson(url, { timeout: 8000 })
  if (data.status !== 'ok') throw new Error('waqi')
  const d = data.data
  return normalize({
    aqi: d.aqi,
    pm25: d.iaqi?.pm25?.v,
    pm10: d.iaqi?.pm10?.v,
    source: 'waqi',
    updatedAt: d.time?.iso,
  })
}

async function fromOpenMeteo(lat, lon) {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&current=pm2_5,pm10,us_aqi,european_aqi`

  const data = await fetchJson(url, { timeout: 8000 })
  const cur = data.current
  if (!cur) throw new Error('meteo empty')

  return normalize({
    aqi: approxCnAqiFromUs(cur.us_aqi) ?? cur.european_aqi,
    pm25: cur.pm2_5,
    pm10: cur.pm10,
    source: 'meteo',
    updatedAt: cur.time ? new Date(`${cur.time}Z`).toISOString() : undefined,
  })
}

async function fetchAirQualityOnce(la, lo) {
  const providers = [
    () => fromCaiyun(la, lo),
    () => fromWaqi(la, lo),
    () => fromOpenMeteo(la, lo),
  ]

  let last = 'air'
  for (const fn of providers) {
    try {
      const result = await fn()
      if (result.aqi != null || result.pm25 != null) return result
    } catch (e) {
      last = sanitizeError(e, 'air')
    }
  }
  throw new Error(last)
}

export async function fetchAirQuality({ lat, lon, force = false } = {}) {
  const la = truncateCoord(lat)
  const lo = truncateCoord(lon)
  if (la == null || lo == null) throw new Error('coords')

  // 坐标粒度已截断，作为缓存 key
  const key = `air:${la},${lo}`
  return guardedRequest(key, () => fetchAirQualityOnce(la, lo), {
    ttlMs: AIR_TTL,
    errorTtlMs: AIR_ERR_TTL,
    force: Boolean(force),
  })
}

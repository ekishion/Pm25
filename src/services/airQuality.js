/**
 * 空气质量
 * 含密钥源：仅 /api/* 同源代理
 * 公开源：Open-Meteo（无密钥）
 * 多源并行抢跑，谁先返回有效读数用谁
 */

import { approxCnAqiFromUs } from '../utils/aqi'
import { fetchJson } from './http'
import { isValidCoord, sanitizeError, truncateCoord } from '../utils/safe'
import { guardedRequest, clearRequestCache } from '../utils/requestGuard'

const AIR_TTL = 5 * 60 * 1000
const AIR_ERR_TTL = 12 * 1000
const TIMEOUT = 5500

function normalize(partial) {
  let aqi = Number(partial.aqi)
  let pm25 = Number(partial.pm25)
  const pm10 = Number(partial.pm10)

  // 部分源会吐出 pm25=0 同时 aqi>0，0 通常是缺测/占位
  if (Number.isFinite(pm25) && pm25 <= 0 && Number.isFinite(aqi) && aqi > 2) {
    pm25 = NaN
  }

  return {
    aqi: Number.isFinite(aqi) ? Math.round(aqi) : null,
    pm25: Number.isFinite(pm25) && pm25 >= 0 ? Math.round(pm25 * 10) / 10 : null,
    pm10: Number.isFinite(pm10) && pm10 >= 0 ? Math.round(pm10 * 10) / 10 : null,
    source: partial.source || '',
    updatedAt: partial.updatedAt || new Date().toISOString(),
  }
}

function hasReading(result) {
  return result && (result.aqi != null || result.pm25 != null)
}

async function fromCaiyun(lat, lon) {
  const path = `/${lon},${lat}/realtime.json`
  const data = await fetchJson(`/api/caiyun${path}`, { timeout: TIMEOUT })
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
  const data = await fetchJson(url, { timeout: TIMEOUT })
  if (data.status !== 'ok') throw new Error('waqi')
  const d = data.data
  // WAQI 偶发 "-" 字符串 aqi
  const aqi = typeof d.aqi === 'number' ? d.aqi : Number(d.aqi)
  return normalize({
    aqi: Number.isFinite(aqi) ? aqi : null,
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

  const data = await fetchJson(url, { timeout: TIMEOUT })
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

/** 并行请求，第一个有效读数胜出；全部失败才 reject */
async function fetchAirQualityOnce(la, lo) {
  const providers = [
    () => fromCaiyun(la, lo),
    () => fromWaqi(la, lo),
    () => fromOpenMeteo(la, lo),
  ]

  return new Promise((resolve, reject) => {
    let left = providers.length
    let last = 'air'
    let settled = false

    for (const fn of providers) {
      fn()
        .then((result) => {
          if (settled) return
          if (hasReading(result)) {
            settled = true
            resolve(result)
            return
          }
          last = 'air empty'
          left -= 1
          if (left <= 0) reject(new Error(last))
        })
        .catch((e) => {
          if (settled) return
          last = sanitizeError(e, 'air')
          left -= 1
          if (left <= 0) reject(new Error(last))
        })
    }
  })
}

export async function fetchAirQuality({ lat, lon, force = false } = {}) {
  const la = truncateCoord(lat)
  const lo = truncateCoord(lon)
  if (!isValidCoord(la, lo)) throw new Error('coords')

  const key = `air:${la},${lo}`
  if (force) clearRequestCache(key)

  return guardedRequest(key, () => fetchAirQualityOnce(la, lo), {
    ttlMs: AIR_TTL,
    errorTtlMs: AIR_ERR_TTL,
    force: Boolean(force),
  })
}

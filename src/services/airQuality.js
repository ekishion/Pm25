/**
 * 空气质量
 * 含密钥源：仅 /api/* 同源代理
 * 公开源：Open-Meteo（无密钥，模型值，仅兜底）
 *
 * 优先级：和风（国标站点）→ 彩云 → WAQI → Open-Meteo
 * 总超时 OVERALL_DEADLINE_MS 强制进入兜底，避免分级等待累加到 8–10s。
 */

import { cnAqiFromPm25, resolveDisplayAqi } from '../utils/aqi'
import { fetchJson } from './http'
import { isValidCoord, sanitizeError, truncateCoord } from '../utils/safe'
import { guardedRequest, clearRequestCache } from '../utils/requestGuard'

const AIR_TTL = 5 * 60 * 1000
const AIR_ERR_TTL = 12 * 1000
const TIMEOUT = 4500
/** 优先源短等窗口 */
const PRIMARY_WAIT_MS = 2200
/** 整条空气链路硬上限（含兜底前的优先源） */
export const OVERALL_DEADLINE_MS = 6500

export function normalize(partial) {
  let aqi = Number(partial.aqi)
  let pm25 = Number(partial.pm25)
  const pm10 = Number(partial.pm10)

  // 部分源会吐出 pm25=0 同时 aqi>0，0 通常是缺测/占位
  if (Number.isFinite(pm25) && pm25 <= 0 && Number.isFinite(aqi) && aqi > 2) {
    pm25 = NaN
  }

  const pm25Out = Number.isFinite(pm25) && pm25 >= 0 ? Math.round(pm25 * 10) / 10 : null
  const aqiOut = resolveDisplayAqi({
    pm25: pm25Out,
    aqi: Number.isFinite(aqi) ? aqi : null,
  })

  return {
    aqi: aqiOut,
    pm25: pm25Out,
    pm10: Number.isFinite(pm10) && pm10 >= 0 ? Math.round(pm10 * 10) / 10 : null,
    source: partial.source || '',
    updatedAt: partial.updatedAt || new Date().toISOString(),
  }
}

export function hasReading(result) {
  return result && (result.aqi != null || result.pm25 != null)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 和风空气质量 v1（坐标）
 * GET /api/qweather/airquality/v1/current/{lat}/{lon}
 */
export async function fromQweather(lat, lon, { fetchImpl = fetchJson } = {}) {
  const path = `/airquality/v1/current/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`
  const data = await fetchImpl(`/api/qweather${path}`, { timeout: TIMEOUT })

  if (data.code && String(data.code) !== '200') {
    throw new Error(`qweather ${data.code}`)
  }

  const indexes = Array.isArray(data.indexes) ? data.indexes : []
  const cnIndex =
    indexes.find((x) => /cn-mee|cn_mee|china|chn/i.test(String(x?.code || x?.name || ''))) ||
    indexes.find((x) => /国标|中国/i.test(String(x?.name || ''))) ||
    indexes[0]

  let aqi = cnIndex?.aqi != null ? Number(cnIndex.aqi) : null
  if (!Number.isFinite(aqi) && cnIndex?.aqiDisplay != null) {
    aqi = Number(cnIndex.aqiDisplay)
  }

  const pollutants = Array.isArray(data.pollutants) ? data.pollutants : []
  const pickPollutant = (...codes) => {
    for (const code of codes) {
      const hit = pollutants.find(
        (p) =>
          String(p?.code || '').toLowerCase() === code ||
          String(p?.name || '').toLowerCase().includes(code),
      )
      if (!hit) continue
      const v = hit.concentration?.value ?? hit.concentration ?? hit.value
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
    return null
  }

  const pm25 = pickPollutant('pm2p5', 'pm25', 'pm2.5')
  const pm10 = pickPollutant('pm10')

  if (!Number.isFinite(aqi) && Array.isArray(data.stations) && data.stations.length) {
    const sAqi = Number(data.stations[0]?.aqi)
    if (Number.isFinite(sAqi)) aqi = sAqi
  }

  const result = normalize({
    aqi: Number.isFinite(aqi) ? aqi : null,
    pm25,
    pm10,
    source: 'qweather',
    updatedAt: data.metadata?.updateTime || data.updateTime,
  })
  if (!hasReading(result)) throw new Error('qweather empty')
  return result
}

export async function fromQweatherV7(lat, lon, { fetchImpl = fetchJson } = {}) {
  const location = `${lon},${lat}`
  const data = await fetchImpl(
    `/api/qweather/v7/air/now?location=${encodeURIComponent(location)}`,
    { timeout: TIMEOUT },
  )
  if (String(data.code) !== '200') throw new Error(`qweather-v7 ${data.code || 'err'}`)
  const now = data.now
  if (!now) throw new Error('qweather-v7 empty')
  return normalize({
    aqi: now.aqi,
    pm25: now.pm2p5 ?? now.pm25,
    pm10: now.pm10,
    source: 'qweather',
    updatedAt: now.pubTime || data.updateTime,
  })
}

export async function fromQweatherAny(lat, lon, opts = {}) {
  try {
    return await fromQweather(lat, lon, opts)
  } catch {
    return fromQweatherV7(lat, lon, opts)
  }
}

export async function fromCaiyun(lat, lon, { fetchImpl = fetchJson } = {}) {
  const path = `/${lon},${lat}/realtime.json`
  const data = await fetchImpl(`/api/caiyun${path}`, { timeout: TIMEOUT })
  if (data.status && data.status !== 'ok') throw new Error('caiyun')

  const aq = data.result?.realtime?.air_quality
  if (!aq) throw new Error('caiyun empty')

  let aqi = null
  if (aq.aqi && typeof aq.aqi.chn === 'number') aqi = aq.aqi.chn
  else if (typeof aq.aqi === 'number') aqi = aq.aqi
  else if (aq.aqi && typeof aq.aqi.usa === 'number') {
    aqi = cnAqiFromPm25(aq.pm25) ?? null
  }

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

export async function fromWaqi(lat, lon, { fetchImpl = fetchJson } = {}) {
  const url = `/api/waqi/feed/geo:${lat};${lon}/`
  const data = await fetchImpl(url, { timeout: TIMEOUT })
  if (data.status !== 'ok') throw new Error('waqi')
  const d = data.data
  const rawAqi = typeof d.aqi === 'number' ? d.aqi : Number(d.aqi)
  const pm25 = d.iaqi?.pm25?.v
  const aqi = cnAqiFromPm25(pm25) ?? (Number.isFinite(rawAqi) ? rawAqi : null)

  return normalize({
    aqi,
    pm25,
    pm10: d.iaqi?.pm10?.v,
    source: 'waqi',
    updatedAt: d.time?.iso,
  })
}

export async function fromOpenMeteo(lat, lon, { fetchImpl = fetchJson } = {}) {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&current=pm2_5,pm10,us_aqi,european_aqi`

  const data = await fetchImpl(url, { timeout: TIMEOUT })
  const cur = data.current
  if (!cur) throw new Error('meteo empty')

  const aqi = cnAqiFromPm25(cur.pm2_5)

  return normalize({
    aqi,
    pm25: cur.pm2_5,
    pm10: cur.pm10,
    source: 'meteo',
    updatedAt: cur.time ? new Date(`${cur.time}Z`).toISOString() : undefined,
  })
}

/**
 * 分级获取（可注入 sources 便于单测）
 * @param {number} la
 * @param {number} lo
 * @param {{
 *   sources?: {
 *     qweather?: () => Promise<any>,
 *     caiyun?: () => Promise<any>,
 *     waqi?: () => Promise<any>,
 *     meteo?: () => Promise<any>,
 *   },
 *   primaryWaitMs?: number,
 *   overallDeadlineMs?: number,
 * }} [opts]
 */
export async function fetchAirQualityOnce(la, lo, opts = {}) {
  const primaryWait = opts.primaryWaitMs ?? PRIMARY_WAIT_MS
  const deadline = opts.overallDeadlineMs ?? OVERALL_DEADLINE_MS
  const started = Date.now()
  const remain = () => Math.max(0, deadline - (Date.now() - started))

  const sources = opts.sources || {
    qweather: () => fromQweatherAny(la, lo),
    caiyun: () => fromCaiyun(la, lo),
    waqi: () => fromWaqi(la, lo),
    meteo: () => fromOpenMeteo(la, lo),
  }

  const wrap = (fn, name) =>
    fn().then((r) => {
      if (!hasReading(r)) throw new Error(`${name} empty`)
      return r
    })

  const qweatherP = wrap(sources.qweather, 'qweather')
  const caiyunP = wrap(sources.caiyun, 'caiyun')
  const waqiP = wrap(sources.waqi, 'waqi')

  // 和风优先
  const qwWait = Math.min(primaryWait, remain())
  const qwQuick = await Promise.race([
    qweatherP.catch(() => null),
    sleep(qwWait).then(() => null),
  ])
  if (hasReading(qwQuick)) return qwQuick
  if (remain() <= 0) {
    // 总时限到：直接兜底
    return wrap(sources.meteo, 'meteo')
  }

  // 彩云次选
  const cyWait = Math.min(primaryWait, remain())
  const caiyunQuick = await Promise.race([
    caiyunP.catch(() => null),
    sleep(cyWait).then(() => null),
  ])
  if (hasReading(caiyunQuick)) return caiyunQuick
  if (remain() <= 0) return wrap(sources.meteo, 'meteo')

  // WAQI 短等
  const waqiWait = Math.min(500, remain())
  const waqiQuick = await Promise.race([
    waqiP.catch(() => null),
    sleep(waqiWait).then(() => null),
  ])
  if (hasReading(waqiQuick)) return waqiQuick

  // 收尾：在剩余时间内等优先源
  const tail = await Promise.race([
    Promise.allSettled([qweatherP, caiyunP, waqiP]),
    sleep(remain()).then(() => null),
  ])

  if (tail) {
    const order = ['qweather', 'caiyun', 'waqi']
    for (const name of order) {
      const hit = tail.find(
        (s) => s.status === 'fulfilled' && hasReading(s.value) && s.value.source === name,
      )
      if (hit) return hit.value
    }
    for (const s of tail) {
      if (s.status === 'fulfilled' && hasReading(s.value)) return s.value
    }
  }

  // 兜底模型
  try {
    const meteo = await wrap(sources.meteo, 'meteo')
    if (hasReading(meteo)) return meteo
  } catch (e) {
    throw new Error(sanitizeError(e, 'air'))
  }

  throw new Error('air empty')
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

/**
 * 空气质量
 * 含密钥源：仅 /api/* 同源代理
 * 公开源：Open-Meteo（无密钥，模型值，仅兜底）
 *
 * 优先级：和风（国标站点）→ 彩云 → WAQI → Open-Meteo
 * 不再「谁快用谁」——模型源常比站点偏高一截。
 */

import { cnAqiFromPm25, resolveDisplayAqi } from '../utils/aqi'
import { fetchJson } from './http'
import { isValidCoord, sanitizeError, truncateCoord } from '../utils/safe'
import { guardedRequest, clearRequestCache } from '../utils/requestGuard'

const AIR_TTL = 5 * 60 * 1000
const AIR_ERR_TTL = 12 * 1000
const TIMEOUT = 5500
/** 优先源等待窗口：超时再接受次级源 */
const PRIMARY_WAIT_MS = 3000

function normalize(partial) {
  let aqi = Number(partial.aqi)
  let pm25 = Number(partial.pm25)
  const pm10 = Number(partial.pm10)

  // 部分源会吐出 pm25=0 同时 aqi>0，0 通常是缺测/占位
  if (Number.isFinite(pm25) && pm25 <= 0 && Number.isFinite(aqi) && aqi > 2) {
    pm25 = NaN
  }

  const pm25Out = Number.isFinite(pm25) && pm25 >= 0 ? Math.round(pm25 * 10) / 10 : null
  // 统一成国标口径：有 PM2.5 时以浓度反算纠偏美标 AQI
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

function hasReading(result) {
  return result && (result.aqi != null || result.pm25 != null)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 和风空气质量 v1（坐标）
 * GET /api/qweather/airquality/v1/current/{lat}/{lon}
 * 文档: https://dev.qweather.com/docs/api/air-quality/air-current/
 */
async function fromQweather(lat, lon) {
  const path = `/airquality/v1/current/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`
  const data = await fetchJson(`/api/qweather${path}`, { timeout: TIMEOUT })

  // v1 成功时通常无 code，或 code 为 "200"
  if (data.code && String(data.code) !== '200') {
    throw new Error(`qweather ${data.code}`)
  }

  const indexes = Array.isArray(data.indexes) ? data.indexes : []
  // 优先中国国标 cn-mee / qa-cn 一类
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
      // concentration.value 单位多为 μg/m³；CO 可能是 mg/m³
      const v = hit.concentration?.value ?? hit.concentration ?? hit.value
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
    return null
  }

  const pm25 = pickPollutant('pm2p5', 'pm25', 'pm2.5')
  const pm10 = pickPollutant('pm10')

  // 无 indexes 时尝试 stations 平均（少见）
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

/**
 * 和风 v7 兼容：部分 Key 仍走 /v7/air/now?location=lon,lat
 * 仅当 v1 失败时使用
 */
async function fromQweatherV7(lat, lon) {
  const location = `${lon},${lat}`
  const data = await fetchJson(
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

async function fromQweatherAny(lat, lon) {
  try {
    return await fromQweather(lat, lon)
  } catch {
    return fromQweatherV7(lat, lon)
  }
}

async function fromCaiyun(lat, lon) {
  const path = `/${lon},${lat}/realtime.json`
  const data = await fetchJson(`/api/caiyun${path}`, { timeout: TIMEOUT })
  if (data.status && data.status !== 'ok') throw new Error('caiyun')

  const aq = data.result?.realtime?.air_quality
  if (!aq) throw new Error('caiyun empty')

  // 优先中国 AQI；不要误用 usa
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

async function fromWaqi(lat, lon) {
  const url = `/api/waqi/feed/geo:${lat};${lon}/`
  const data = await fetchJson(url, { timeout: TIMEOUT })
  if (data.status !== 'ok') throw new Error('waqi')
  const d = data.data
  // WAQI 的 aqi 字段多为美标；优先用 pm25 反算国标
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

async function fromOpenMeteo(lat, lon) {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&current=pm2_5,pm10,us_aqi,european_aqi`

  const data = await fetchJson(url, { timeout: TIMEOUT })
  const cur = data.current
  if (!cur) throw new Error('meteo empty')

  // 模型浓度，仅兜底；AQI 用国标反算
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
 * 分级获取：
 * 1) 和风（国标站点，最优先）
 * 2) 彩云
 * 3) WAQI
 * 4) Open-Meteo 模型兜底
 */
async function fetchAirQualityOnce(la, lo) {
  const qweatherP = fromQweatherAny(la, lo).then((r) => {
    if (!hasReading(r)) throw new Error('qweather empty')
    return r
  })
  const caiyunP = fromCaiyun(la, lo).then((r) => {
    if (!hasReading(r)) throw new Error('caiyun empty')
    return r
  })
  const waqiP = fromWaqi(la, lo).then((r) => {
    if (!hasReading(r)) throw new Error('waqi empty')
    return r
  })

  // 和风优先：短等
  const qwQuick = await Promise.race([
    qweatherP.catch(() => null),
    sleep(PRIMARY_WAIT_MS).then(() => null),
  ])
  if (hasReading(qwQuick)) return qwQuick

  // 彩云次选
  const caiyunQuick = await Promise.race([
    caiyunP.catch(() => null),
    sleep(PRIMARY_WAIT_MS).then(() => null),
  ])
  if (hasReading(caiyunQuick)) return caiyunQuick

  // WAQI
  const waqiQuick = await Promise.race([
    waqiP.catch(() => null),
    sleep(500).then(() => null),
  ])
  if (hasReading(waqiQuick)) return waqiQuick

  // 再等优先源收尾
  const settled = await Promise.allSettled([qweatherP, caiyunP, waqiP])
  // 按优先级取第一个成功
  const order = ['qweather', 'caiyun', 'waqi']
  for (const name of order) {
    const hit = settled.find(
      (s) => s.status === 'fulfilled' && hasReading(s.value) && s.value.source === name,
    )
    if (hit) return hit.value
  }
  for (const s of settled) {
    if (s.status === 'fulfilled' && hasReading(s.value)) return s.value
  }

  // 仅兜底模型源
  try {
    const meteo = await fromOpenMeteo(la, lo)
    if (hasReading(meteo)) return meteo
  } catch (e) {
    throw new Error(sanitizeError(e, 'air'))
  }

  const last = settled
    .filter((s) => s.status === 'rejected')
    .map((s) => sanitizeError(s.reason, 'air'))
    .join(';')
  throw new Error(last || 'air empty')
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

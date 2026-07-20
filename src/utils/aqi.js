/** 中国 AQI 分级（HJ 633）— 仅内部使用 */
export const AQI_LEVELS = [
  { max: 50, key: 'good', label: '优' },
  { max: 100, key: 'moderate', label: '良' },
  { max: 150, key: 'unhealthy', label: '轻度污染' },
  { max: 200, key: 'bad', label: '中度污染' },
  { max: 300, key: 'bad', label: '重度污染' },
  { max: Infinity, key: 'hazard', label: '严重污染' },
]

export function getAqiLevel(aqi) {
  const value = Number(aqi)
  if (!Number.isFinite(value) || value < 0) {
    return { max: 0, key: 'moderate', label: '未知' }
  }
  return AQI_LEVELS.find((level) => value <= level.max) || AQI_LEVELS[AQI_LEVELS.length - 1]
}

export function approxCnAqiFromUs(usAqi) {
  const v = Number(usAqi)
  if (!Number.isFinite(v)) return null
  return Math.round(v)
}

/**
 * 火柴燃烧换算（体验向）
 * 1 根火柴 ≈ 8 μg/m³·m³；呼吸量 0.5 m³/h
 * matchesPerHour ≈ pm25 * 0.5 / 8
 */
export const MATCH_PM25_PER_M3 = 8
export const BREATH_M3_PER_HOUR = 0.5

/** 低于此浓度视为「空气极净」：视觉上几乎不燃 */
export const CLEAN_PM25 = 2

/**
 * 选用于换算的浓度。
 * 部分源会给 pm25=0 但 aqi 仍有读数；此时 0 不可信，回退 aqi。
 */
export function pickConcentration({ pm25, aqi } = {}) {
  const p = Number(pm25)
  const a = Number(aqi)
  const hasP = Number.isFinite(p) && p >= 0
  const hasA = Number.isFinite(a) && a >= 0

  if (hasP && hasA) {
    // pm25 明确为 0、但 AQI 显示仍有污染 → 信 AQI
    if (p <= 0 && a > CLEAN_PM25) return a
    // 两者都有时优先 PM2.5（更贴合火柴换算）
    return p
  }
  if (hasP) return p
  if (hasA) return a
  return 0
}

export function calcMatchEquivalents({ pm25, aqi }) {
  const concentration = pickConcentration({ pm25, aqi })

  const matchesPerHour = (concentration * BREATH_M3_PER_HOUR) / MATCH_PM25_PER_M3
  const matchesPerDay = matchesPerHour * 24
  const displayMatches = Math.max(0, Math.round(matchesPerHour * 10) / 10)
  // 极净空气：强度压到 0，避免 0 根/时还在旺烧
  const burnIntensity =
    concentration <= CLEAN_PM25 ? 0 : Math.min(1, Math.max(0.04, concentration / 150))
  const isClean = concentration <= CLEAN_PM25 || displayMatches <= 0

  return {
    concentration,
    matchesPerHour: displayMatches,
    matchesPerDay: Math.round(matchesPerDay * 10) / 10,
    burnIntensity,
    isClean,
  }
}

export function formatNumber(n, digits = 0) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '–'
  return v.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

/** 火柴计数展示：整数不带小数，否则一位小数 */
export function formatMatchCount(n) {
  if (!Number.isFinite(Number(n))) return '–'
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1)
}

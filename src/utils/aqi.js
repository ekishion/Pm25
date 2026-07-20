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

/**
 * 中国 AQI（HJ 633）由 PM2.5 浓度反算。
 * 断点: μg/m³ → AQI
 */
const PM25_CN_BREAKPOINTS = [
  [0, 0],
  [35, 50],
  [75, 100],
  [115, 150],
  [150, 200],
  [250, 300],
  [350, 400],
  [500, 500],
]

export function cnAqiFromPm25(pm25) {
  const c = Number(pm25)
  if (!Number.isFinite(c) || c < 0) return null
  if (c >= 500) return 500
  for (let i = 1; i < PM25_CN_BREAKPOINTS.length; i += 1) {
    const [clow, ilow] = PM25_CN_BREAKPOINTS[i - 1]
    const [chigh, ihigh] = PM25_CN_BREAKPOINTS[i]
    if (c <= chigh) {
      if (chigh === clow) return ihigh
      const aqi = ((ihigh - ilow) / (chigh - clow)) * (c - clow) + ilow
      return Math.round(aqi)
    }
  }
  return 500
}

/**
 * 旧名保留：若只有 US AQI 无浓度，无法精确换算，原样返回（不推荐依赖）。
 * 有 PM2.5 时请用 cnAqiFromPm25。
 */
export function approxCnAqiFromUs(usAqi) {
  const v = Number(usAqi)
  if (!Number.isFinite(v)) return null
  return Math.round(v)
}

/**
 * 展示/模式用 AQI：优先可信的国标值。
 * 若同时有 PM2.5，且上报 AQI 明显高于国标反算（常见于美标），改用反算值。
 */
export function resolveDisplayAqi({ pm25, aqi } = {}) {
  const p = Number(pm25)
  const a = Number(aqi)
  const hasP = Number.isFinite(p) && p >= 0
  const hasA = Number.isFinite(a) && a >= 0
  const fromPm = hasP ? cnAqiFromPm25(p) : null

  if (hasA && fromPm != null) {
    // 上报 AQI 比国标反算高一截 → 多半是 US AQI
    if (a > fromPm * 1.35 + 15) return fromPm
    return Math.round(a)
  }
  if (hasA) return Math.round(a)
  if (fromPm != null) return fromPm
  return null
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

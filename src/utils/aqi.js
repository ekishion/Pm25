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

export function calcMatchEquivalents({ pm25, aqi }) {
  const concentration =
    Number.isFinite(Number(pm25)) && Number(pm25) >= 0
      ? Number(pm25)
      : Number.isFinite(Number(aqi)) && Number(aqi) >= 0
        ? Number(aqi)
        : 0

  const matchesPerHour = (concentration * BREATH_M3_PER_HOUR) / MATCH_PM25_PER_M3
  const matchesPerDay = matchesPerHour * 24
  const displayMatches = Math.max(0, Math.round(matchesPerHour * 10) / 10)
  const burnIntensity = Math.min(1, concentration / 150)

  return {
    concentration,
    matchesPerHour: displayMatches,
    matchesPerDay: Math.round(matchesPerDay * 10) / 10,
    burnIntensity,
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

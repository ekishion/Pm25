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

/** 国标 AQI 封顶对应的 PM2.5 浓度（μg/m³） */
export const PM25_OFF_SCALE = 500

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
 *
 * 纠偏启发式（经验阈值，非国标公式）：
 * - 国标 AQI 与 US AQI 在同一 PM2.5 下常差一截（如 PM2.5=55 → 国标≈75，US≈150）
 * - 若上报 aqi > 国标反算 * 1.35 + 15，视为“美标/混用”并改用反算值
 * - 系数 1.35 与 +15 来自多源实测对照（彩云 usa vs chn、Open-Meteo us_aqi vs 反算）
 *   故意偏保守：只有明显偏高才纠偏，避免把略高的国标读数误伤
 * - 阈值由 aqi.test.js 锁定，改动前请补样本
 */
export const AQI_US_DRIFT_RATIO = 1.35
export const AQI_US_DRIFT_PAD = 15

export function resolveDisplayAqi({ pm25, aqi } = {}) {
  // null/undefined 不能走 Number(null)===0
  const hasP = pm25 != null && pm25 !== '' && Number.isFinite(Number(pm25)) && Number(pm25) >= 0
  const hasA = aqi != null && aqi !== '' && Number.isFinite(Number(aqi)) && Number(aqi) >= 0
  const p = hasP ? Number(pm25) : NaN
  const a = hasA ? Number(aqi) : NaN
  const fromPm = hasP ? cnAqiFromPm25(p) : null

  if (hasA && fromPm != null) {
    if (a > fromPm * AQI_US_DRIFT_RATIO + AQI_US_DRIFT_PAD) return fromPm
    return Math.round(a)
  }
  if (hasA) return Math.round(a)
  if (fromPm != null) return fromPm
  return null
}

/**
 * 火柴燃烧换算（体验向，不是实验室排放系数）
 *
 * MATCH_PM25_PER_M3：一根火柴在体验叙事里等价的 PM2.5 负荷（μg/m³·m³ 量级）。
 * 取 8 是为了让日常城市读数落在「0.x～十几根/时」的可读区间，而不是科学计量。
 *
 * BREATH_M3_PER_HOUR：安静活动下约 0.5 m³/h 的呼吸量（体验取值）。
 * matchesPerHour ≈ concentration × BREATH / MATCH
 */
export const MATCH_PM25_PER_M3 = 8
export const BREATH_M3_PER_HOUR = 0.5

/**
 * 低于此浓度（μg/m³）视为「空气极净」：
 * 火柴当量接近 0，UI 走余温态（isClean），不表示物理上绝对无尘。
 */
export const CLEAN_PM25 = 2

/**
 * 燃烧强度曲线的特征浓度 K（μg/m³）。
 * intensity = 1 - e^(-c / K)
 * - K 越大，中低污染段越「温吞」
 * - 取 90：日常良/轻度有区分，篝火分界（150）时约 0.81，不顶死 1
 * 体验调参，不是物理常数。
 */
export const BURN_INTENSITY_K = 90

/**
 * 选用于换算的浓度。
 * 部分源会给 pm25=0 但 aqi 仍有读数；此时 0 不可信，回退 aqi。
 */
export function pickConcentration({ pm25, aqi } = {}) {
  const hasP = pm25 != null && pm25 !== '' && Number.isFinite(Number(pm25)) && Number(pm25) >= 0
  const hasA = aqi != null && aqi !== '' && Number.isFinite(Number(aqi)) && Number(aqi) >= 0
  const p = hasP ? Number(pm25) : NaN
  const a = hasA ? Number(aqi) : NaN

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

/** 浓度 → 火柴/时（未四舍五入） */
export function matchesPerHourFromConcentration(concentration) {
  const c = Number(concentration)
  if (!Number.isFinite(c) || c <= 0) return 0
  return (c * BREATH_M3_PER_HOUR) / MATCH_PM25_PER_M3
}

/**
 * 浓度 → 视觉燃烧强度 [0, 1)
 * 连续饱和：1 - exp(-c / K)，c→0 自然→0，高污染渐近 1 且不硬顶。
 */
export function computeBurnIntensity(concentration) {
  const c = Number(concentration)
  if (!Number.isFinite(c) || c <= 0) return 0
  const k = BURN_INTENSITY_K
  if (!(k > 0)) return 0
  const v = 1 - Math.exp(-c / k)
  // 数值噪声保护
  if (!Number.isFinite(v) || v < 0) return 0
  if (v > 0.999) return 0.999
  return v
}

/**
 * 组装展示用火柴当量对象。
 * 调用方签名保持 { pm25, aqi } → 字段兼容；新增 offScale。
 */
export function calcMatchEquivalents({ pm25, aqi } = {}) {
  const concentration = pickConcentration({ pm25, aqi })
  const rawPerHour = matchesPerHourFromConcentration(concentration)
  const matchesPerHour = Math.max(0, Math.round(rawPerHour * 10) / 10)
  const matchesPerDay = Math.round(rawPerHour * 24 * 10) / 10
  const burnIntensity = computeBurnIntensity(concentration)
  const isClean = concentration <= CLEAN_PM25 || matchesPerHour <= 0
  // 超过国标 AQI 封顶对应浓度：数字仍按公式算，UI 可标「爆表」
  const offScale = concentration > PM25_OFF_SCALE

  return {
    concentration,
    matchesPerHour,
    matchesPerDay,
    burnIntensity,
    isClean,
    offScale,
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

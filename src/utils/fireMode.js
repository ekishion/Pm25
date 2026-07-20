/**
 * 火候模式与布局 —— 主界面 DOM / 分享卡 Canvas 共用
 */

/** @typedef {'match'|'cluster'|'bonfire'} FireMode */

export const FIRE_MODE = {
  match: 'match',
  cluster: 'cluster',
  bonfire: 'bonfire',
}

/** 模式切换阈值（与体验调参一致） */
export const MODE_THRESHOLDS = {
  /** AQI 或浓度 ≥ 此值 → 火堆 */
  bonfireAqi: 150,
  /** 火柴/时 ≥ 此值 → 火堆 */
  bonfireMatches: 8,
  /** AQI ≥ 此值 → 一簇 */
  clusterAqi: 75,
  /** 火柴/时 ≥ 此值 → 一簇 */
  clusterMatches: 3,
}

/**
 * 根据空气数据解析展示模式
 * @param {{ aqi?: number, matchesPerHour?: number, concentration?: number }} input
 * @returns {FireMode}
 */
export function resolveFireMode(input = {}) {
  const n = Number(input.matchesPerHour) || 0
  const aqi = Number(input.aqi ?? input.concentration) || 0
  const { bonfireAqi, bonfireMatches, clusterAqi, clusterMatches } = MODE_THRESHOLDS
  if (aqi >= bonfireAqi || n >= bonfireMatches) return FIRE_MODE.bonfire
  if (aqi >= clusterAqi || n >= clusterMatches) return FIRE_MODE.cluster
  return FIRE_MODE.match
}

/** DOM 场景硬上限 */
export const SCENE_LIMITS = {
  maxMatch: 18,
  maxSmoke: 10,
  maxEmber: 8,
  clusterMin: 3,
  clusterMax: 7,
  bonfireMin: 10,
}

/**
 * 目标火柴根数（生长动画终点）
 * @param {FireMode} mode
 * @param {number} matchCount
 */
export function targetMatchCount(mode, matchCount) {
  const n = Math.max(0, Number(matchCount) || 0)
  if (mode === FIRE_MODE.match) return 1
  if (mode === FIRE_MODE.cluster) {
    return Math.min(SCENE_LIMITS.clusterMax, Math.max(SCENE_LIMITS.clusterMin, Math.ceil(n)))
  }
  return Math.min(SCENE_LIMITS.maxMatch, Math.max(SCENE_LIMITS.bonfireMin, Math.ceil(n * 0.75)))
}

/**
 * 一簇扇形：相对布局（t ∈ [0,1]）
 * 调用方乘以 spread 得到像素
 */
export function clusterSlot(i, total) {
  const t = total <= 1 ? 0.5 : i / (total - 1)
  return {
    t,
    /** 相对横向 -0.5…0.5，乘 spread */
    nx: t - 0.5,
    /** 相对旋转 -0.5…0.5，乘 maxRot */
    nrot: t - 0.5,
    /** 相对纵向抬升 0…0.5，乘 lift */
    nlift: Math.abs(t - 0.5),
  }
}

/** 一簇默认像素参数（DOM） */
export const CLUSTER_LAYOUT = {
  spread: 92,
  maxRot: 38,
  lift: 14,
}

/** 一簇默认像素参数（Canvas 1080 宽） */
export const CLUSTER_LAYOUT_CANVAS = {
  spread: 200,
  maxRot: 36,
  lift: 16,
  scale: 1.12,
}

/**
 * 篝火木柴布局（DOM 坐标系：相对底部中心）
 * kind: base 横柴 | teepee 尖顶竖柴
 */
export const BONFIRE_LOGS = [
  { rot: -14, x: 0, y: 12, h: 17, w: 112, char: 0.7, kind: 'base', z: 7 },
  { rot: 22, x: -2, y: 5, h: 16, w: 100, char: 0.66, kind: 'base', z: 8 },
  { rot: -58, x: -30, y: 2, h: 86, w: 15, char: 0.46, kind: 'teepee', z: 11 },
  { rot: -26, x: -11, y: 0, h: 100, w: 16, char: 0.52, kind: 'teepee', z: 13 },
  { rot: 26, x: 11, y: 0, h: 100, w: 16, char: 0.5, kind: 'teepee', z: 13 },
  { rot: 58, x: 30, y: 2, h: 86, w: 15, char: 0.48, kind: 'teepee', z: 11 },
  { rot: -40, x: -19, y: 1, h: 78, w: 13, char: 0.44, kind: 'teepee', z: 12 },
  { rot: 40, x: 19, y: 1, h: 78, w: 13, char: 0.45, kind: 'teepee', z: 12 },
]

/**
 * 根据可见火柴数决定显示几根柴
 * @param {number} visibleMatches
 */
export function bonfireLogCount(visibleMatches) {
  const n = Number(visibleMatches) || 0
  if (n < 11) return 5
  if (n < 13) return 6
  if (n < 15) return 7
  return Math.min(BONFIRE_LOGS.length, 8)
}

/**
 * Canvas 用：把 DOM 柴布局缩放到分享卡坐标系
 * @param {number} [scale=1.28]
 */
export function bonfireLogsForCanvas(scale = 1.28) {
  return BONFIRE_LOGS.map((log) => ({
    ...log,
    x: log.x * scale,
    y: log.y * scale,
    w: log.w * scale,
    h: log.h * scale,
  }))
}

/**
 * 生长阶段展示模式（点燃后由少变多）
 * @param {FireMode} targetMode
 * @param {number} visibleCount
 * @param {boolean} isLit
 * @returns {FireMode}
 */
export function displayFireMode(targetMode, visibleCount, isLit) {
  if (!isLit) return FIRE_MODE.match
  const n = Number(visibleCount) || 0
  if (targetMode === FIRE_MODE.bonfire && n >= SCENE_LIMITS.bonfireMin) return FIRE_MODE.bonfire
  if (
    (targetMode === FIRE_MODE.cluster || targetMode === FIRE_MODE.bonfire) &&
    n >= SCENE_LIMITS.clusterMin
  ) {
    return FIRE_MODE.cluster
  }
  return FIRE_MODE.match
}

/**
 * 日查询配额（进程内内存 Map）
 *
 * 行为：
 * - 默认每天 500 次上游代理调用（一次页面加载约消耗 3–6 次）
 * - env.DAILY_API_LIMIT 可覆盖；0 / 负数 = 不限制
 * - 上游 5xx / 超时的预扣额度通过 refundQuota 退还（见 proxy.mjs）
 *
 * Serverless / Edge 注意（Vercel Edge · Cloudflare Workers / Pages）：
 * - 每个 isolate / runner 的内存相互隔离，Map 不会跨实例共享
 * - 多并发时实际全站上限 ≈ DAILY_API_LIMIT × 活跃实例数（best-effort 防刷）
 * - 若需要严格全局日限额，请改用集中存储，例如：
 *   Cloudflare KV / Durable Objects、Vercel KV (Upstash Redis)、或外部限流服务
 * - 当前实现适合「轻量防刷 + 成本兜底」；生产硬限流请叠加平台 Rate Limit
 *
 * 测试：resetQuotaForTests() 清空 buckets
 */

/** @type {Map<string, { day: string, count: number }>} */
const buckets = new Map()

export const DEFAULT_DAILY_API_LIMIT = 500

export function parseDailyLimit(env = {}) {
  const raw = env.DAILY_API_LIMIT
  if (raw == null || raw === '') return DEFAULT_DAILY_API_LIMIT
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_DAILY_API_LIMIT
  if (n <= 0) return 0 // unlimited
  return Math.floor(n)
}

/** UTC 日期键 YYYY-MM-DD */
export function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

/**
 * @param {{ limit?: number, key?: string, now?: Date }} [opts]
 * @returns {{ allowed: boolean, limit: number, remaining: number, used: number, day: string }}
 */
export function takeQuota(opts = {}) {
  const limit = opts.limit != null ? opts.limit : DEFAULT_DAILY_API_LIMIT
  const day = utcDayKey(opts.now || new Date())
  const key = opts.key || 'global'

  if (limit <= 0) {
    return { allowed: true, limit: 0, remaining: Infinity, used: 0, day }
  }

  let b = buckets.get(key)
  if (!b || b.day !== day) {
    b = { day, count: 0 }
    buckets.set(key, b)
  }

  if (b.count >= limit) {
    return { allowed: false, limit, remaining: 0, used: b.count, day }
  }

  b.count += 1
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - b.count),
    used: b.count,
    day,
  }
}

/**
 * 退还一次预扣额度：上游 5xx / 超时等未产生有效数据时调用。
 * 尽力而为：仅对同 isolate 内存桶生效；跨日 / 桶不存在 / 不限量时忽略。
 */
export function refundQuota(opts = {}) {
  const limit = opts.limit != null ? opts.limit : DEFAULT_DAILY_API_LIMIT
  const day = utcDayKey(opts.now || new Date())
  const key = opts.key || 'global'
  if (limit <= 0) return
  const b = buckets.get(key)
  if (!b || b.day !== day) return
  b.count = Math.max(0, b.count - 1)
}

/** 测试用 */
export function resetQuotaForTests() {
  buckets.clear()
}

export function peekQuota(opts = {}) {
  const limit = opts.limit != null ? opts.limit : DEFAULT_DAILY_API_LIMIT
  const day = utcDayKey(opts.now || new Date())
  const key = opts.key || 'global'
  if (limit <= 0) {
    return { limit: 0, remaining: Infinity, used: 0, day }
  }
  const b = buckets.get(key)
  const used = b && b.day === day ? b.count : 0
  return { limit, remaining: Math.max(0, limit - used), used, day }
}

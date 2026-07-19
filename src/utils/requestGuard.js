/**
 * 请求节流 / 缓存 / 并发去重
 * - 同一 key 进行中的请求共享同一个 Promise
 * - 成功结果短时缓存（内存 + sessionStorage）
 * - 失败也短冷却，避免刷新风暴
 */

const memory = new Map()
/** @type {Map<string, Promise<any>>} */
const inflight = new Map()
const SS_PREFIX = 'pm25:c:'

function now() {
  return Date.now()
}

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writeSession(key, entry) {
  try {
    // 只持久化成功结果，避免把错误状态写死
    if (!entry?.ok) return
    sessionStorage.setItem(
      SS_PREFIX + key,
      JSON.stringify({
        ok: true,
        at: entry.at,
        value: entry.value,
      }),
    )
  } catch {
    /* quota / private mode */
  }
}

function getCached(key, ttlMs) {
  const t = now()
  const mem = memory.get(key)
  if (mem?.ok && t - mem.at < ttlMs) return mem.value

  const ss = readSession(key)
  if (ss?.ok && t - ss.at < ttlMs) {
    memory.set(key, ss)
    return ss.value
  }
  return null
}

/**
 * @param {string} key
 * @param {() => Promise<any>} fn
 * @param {{ ttlMs?: number, errorTtlMs?: number, force?: boolean }} [opts]
 */
export async function guardedRequest(key, fn, opts = {}) {
  const ttlMs = opts.ttlMs ?? 5 * 60 * 1000
  const errorTtlMs = opts.errorTtlMs ?? 20 * 1000
  const force = Boolean(opts.force)
  const t = now()

  if (!force) {
    const cached = getCached(key, ttlMs)
    if (cached != null) return cached

    const hit = memory.get(key)
    if (hit && !hit.ok && t - hit.at < errorTtlMs) {
      throw hit.error instanceof Error ? hit.error : new Error(String(hit.error || 'cached-error'))
    }

    const pending = inflight.get(key)
    if (pending) return pending
  }

  const task = (async () => {
    try {
      const value = await fn()
      const entry = { ok: true, at: now(), value }
      memory.set(key, entry)
      writeSession(key, entry)
      return value
    } catch (error) {
      memory.set(key, { ok: false, at: now(), error })
      throw error
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task)
  return task
}

export function peekCache(key) {
  return getCached(key, Number.POSITIVE_INFINITY)
}

export function clearRequestCache(key) {
  if (key) {
    memory.delete(key)
    inflight.delete(key)
    try {
      sessionStorage.removeItem(SS_PREFIX + key)
    } catch {
      /* ignore */
    }
    return
  }
  memory.clear()
  inflight.clear()
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(SS_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

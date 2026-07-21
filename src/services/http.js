/**
 * 同源请求封装：统一超时、取消、错误脱敏
 * 访问 /api/* 时附带 X-Match-Client，配合边缘代理 CSRF 校验
 */

import { sanitizeError } from '../utils/safe'

/** 与 server/proxy.mjs 保持一致 */
export const CLIENT_HEADER = 'X-Match-Client'
export const CLIENT_HEADER_VALUE = '1'

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, body?: any }} [meta]
   */
  constructor(message, meta = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = meta.status ?? 0
    this.code = meta.code || ''
    this.body = meta.body ?? null
  }
}

function isApiPath(url) {
  try {
    if (url.startsWith('/api/')) return true
    const u = new URL(url, typeof location !== 'undefined' ? location.origin : 'http://local')
    return u.pathname.startsWith('/api/')
  } catch {
    return String(url).includes('/api/')
  }
}

export async function fetchJson(url, options = {}) {
  const controller = new AbortController()
  const timeout = options.timeout ?? 8000
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    }
    if (isApiPath(url)) {
      headers[CLIENT_HEADER] = CLIENT_HEADER_VALUE
    }

    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
      credentials: 'same-origin',
    })

    if (!res.ok) {
      let body = null
      try {
        body = await res.json()
      } catch {
        /* ignore */
      }
      const code = body?.code || (res.status === 429 ? 'DAILY_LIMIT' : '')
      const info = body?.info || `HTTP ${res.status}`
      throw new ApiError(info, { status: res.status, code, body })
    }

    return await res.json()
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (e?.name === 'AbortError') throw new Error('timeout')
    throw new Error(sanitizeError(e, 'network'))
  } finally {
    clearTimeout(timer)
  }
}

export function isDailyLimitError(err) {
  return (
    err instanceof ApiError &&
    (err.status === 429 || err.code === 'DAILY_LIMIT' || /daily limit/i.test(err.message || ''))
  )
}

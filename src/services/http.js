/**
 * 同源请求封装：统一超时、取消、错误脱敏
 * 访问 /api/* 时附带 X-Match-Client，配合边缘代理 CSRF 校验
 */

import { sanitizeError } from '../utils/safe'

/** 与 server/proxy.mjs 保持一致 */
export const CLIENT_HEADER = 'X-Match-Client'
export const CLIENT_HEADER_VALUE = '1'

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
      // 不带 cookies，减少跨站面
      credentials: 'same-origin',
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    return await res.json()
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('timeout')
    throw new Error(sanitizeError(e, 'network'))
  } finally {
    clearTimeout(timer)
  }
}

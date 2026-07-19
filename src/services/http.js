/**
 * 同源请求封装：统一超时、取消、错误脱敏
 */

import { sanitizeError } from '../utils/safe'

export async function fetchJson(url, options = {}) {
  const controller = new AbortController()
  const timeout = options.timeout ?? 8000
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
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

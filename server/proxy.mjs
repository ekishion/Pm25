/**
 * 同源 /api 代理核心（Vercel Edge / Cloudflare Pages 共用）
 * 密钥只从运行时 env 读取，永不进入前端包
 *
 * CSRF / 盗刷防护：
 * 1) 必须带自定义头 X-Match-Client（跨站简单请求带不上；带上会触发 CORS 预检，我们不放行）
 * 2) 若有 Origin / Referer，必须与当前站点同源
 *
 * 日配额：env.DAILY_API_LIMIT（默认 200，≤0 不限制）
 */

import { parseDailyLimit, takeQuota } from './quota.mjs'

const UPSTREAM = {
  amap: 'https://restapi.amap.com',
  caiyun: 'https://api.caiyunapp.com',
  waqi: 'https://api.waqi.info',
  qweather: 'https://devapi.qweather.com',
}

/** 与前端 http.js 保持一致 */
export const CLIENT_HEADER = 'x-match-client'
export const CLIENT_HEADER_VALUE = '1'

/**
 * @param {string} message
 * @param {number} [status]
 * @param {Record<string, string|number|boolean|null|undefined>} [extra]
 * @param {Record<string, string>} [extraHeaders]
 */
export function jsonError(message, status = 502, extra = {}, extraHeaders = {}) {
  const body = { status: 'error', info: message, ...extra }
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  }
  return new Response(JSON.stringify(body), { status, headers })
}

/** 去掉 /api/{provider} 前缀，得到上游 path */
export function stripProviderPrefix(pathname, provider) {
  const prefix = `/api/${provider}`
  let rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname
  if (!rest.startsWith('/')) rest = `/${rest}`
  return rest === '/' ? '' : rest
}

/** 拒绝 path traversal / 异常路径 */
export function sanitizeUpstreamPath(rest) {
  const raw = rest == null || rest === '' ? '/' : rest.startsWith('/') ? rest : `/${rest}`
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    throw new Error('bad path')
  }
  if (
    decoded.includes('..') ||
    decoded.includes('\\') ||
    decoded.includes('\0') ||
    /\/\/+/.test(decoded.replace(/^\/+/, '/'))
  ) {
    throw new Error('bad path')
  }
  // 折叠多余斜杠，保留前导 /
  const clean = `/${decoded.replace(/^\/+/, '').replace(/\/{2,}/g, '/')}`
  return clean === '/' ? '' : clean
}

/**
 * CSRF 校验核心（Node Connect req / Fetch Request 共用）
 * @param {{ method?: string, getHeader: (name: string) => string|undefined|null, selfOrigin: string }} input
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function evaluateTrustedClient({ method = 'GET', getHeader, selfOrigin }) {
  if (String(method).toUpperCase() === 'OPTIONS') {
    return { ok: false, reason: 'forbidden' }
  }

  const marker = getHeader(CLIENT_HEADER) || getHeader('x-match-client')
  if (String(marker || '') !== CLIENT_HEADER_VALUE) {
    return { ok: false, reason: 'forbidden' }
  }

  const origin = getHeader('origin')
  if (origin) {
    if (origin !== selfOrigin) return { ok: false, reason: 'forbidden origin' }
    return { ok: true }
  }

  const referer = getHeader('referer')
  if (referer) {
    try {
      if (new URL(referer).origin !== selfOrigin) {
        return { ok: false, reason: 'forbidden referer' }
      }
    } catch {
      return { ok: false, reason: 'forbidden referer' }
    }
  }

  // 同源 fetch 可能无 Origin/Referer；自定义头已校验，放行
  return { ok: true }
}

/**
 * CSRF / 跨站盗用检查（Fetch Request）。通过返回 null，拒绝返回 Response。
 * @param {Request} request
 * @returns {Response|null}
 */
export function assertTrustedClient(request) {
  const reqUrl = new URL(request.url)
  const result = evaluateTrustedClient({
    method: request.method,
    selfOrigin: reqUrl.origin,
    getHeader: (name) => request.headers.get(name),
  })
  if (result.ok) return null
  return jsonError(result.reason, 403)
}

/**
 * Node/Connect 风格请求的 CSRF 检查（Vite dev/preview 中间件用）
 * @param {{ method?: string, headers: Record<string, string|string[]|undefined> }} req
 * @returns {boolean}
 */
export function isTrustedNodeRequest(req) {
  const headers = req.headers || {}
  const hostHeader = headers['x-forwarded-host'] || headers.host || ''
  const host = String(Array.isArray(hostHeader) ? hostHeader[0] : hostHeader)
    .split(',')[0]
    .trim()
  const protoHeader = headers['x-forwarded-proto'] || 'http'
  const proto = String(Array.isArray(protoHeader) ? protoHeader[0] : protoHeader)
    .split(',')[0]
    .trim()
  const selfOrigin = `${proto}://${host}`

  const getHeader = (name) => {
    const key = String(name).toLowerCase()
    const v = headers[key]
    if (Array.isArray(v)) return v[0]
    return v
  }

  return evaluateTrustedClient({
    method: req.method,
    selfOrigin,
    getHeader,
  }).ok
}

function withSearch(path, searchParams, mutator) {
  const u = new URL(path, 'https://placeholder.local')
  for (const [k, v] of searchParams.entries()) {
    if (!u.searchParams.has(k)) u.searchParams.set(k, v)
  }
  if (mutator) mutator(u.searchParams)
  return u.pathname + u.search
}

/**
 * @param {Request} request
 * @param {{ provider: 'amap'|'caiyun'|'waqi'|'qweather', env: Record<string, string|undefined>, pathSuffix?: string }} opts
 */
export async function proxyProvider(request, { provider, env, pathSuffix }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonError('method not allowed', 405)
  }

  const blocked = assertTrustedClient(request)
  if (blocked) return blocked

  // 日配额：每次成功进入上游前扣 1；超限 429
  const limit = parseDailyLimit(env || {})
  const quota = takeQuota({ limit, key: 'api' })
  if (!quota.allowed) {
    return jsonError(
      'daily limit',
      429,
      {
        code: 'DAILY_LIMIT',
        limit: quota.limit,
        remaining: 0,
        day: quota.day,
      },
      {
        'x-match-quota-limit': String(quota.limit),
        'x-match-quota-remaining': '0',
        'retry-after': '3600',
      },
    )
  }

  const url = new URL(request.url)
  let rest
  try {
    const raw =
      pathSuffix != null
        ? pathSuffix.startsWith('/')
          ? pathSuffix
          : `/${pathSuffix}`
        : stripProviderPrefix(url.pathname, provider)
    rest = sanitizeUpstreamPath(raw)
  } catch {
    return jsonError('bad path', 400)
  }

  const quotaHeaders = {
    'x-match-quota-limit': String(quota.limit || 0),
    'x-match-quota-remaining':
      quota.remaining === Infinity ? '' : String(quota.remaining),
  }

  try {
    if (provider === 'amap') {
      const key = env.AMAP_KEY || ''
      if (!key) return jsonError('AMAP_KEY missing', 500)
      const path = withSearch(rest || '/', url.searchParams, (sp) => {
        if (!sp.get('key')) sp.set('key', key)
      })
      return forward(`${UPSTREAM.amap}${path}`, request.method, quotaHeaders)
    }

    if (provider === 'caiyun') {
      const token = env.CAIYUN_TOKEN || ''
      if (!token) return jsonError('CAIYUN_TOKEN missing', 500)
      // 客户端: /api/caiyun/{lon},{lat}/realtime.json
      // 上游:   /v2.5/{token}/{lon},{lat}/realtime.json
      const path = withSearch(`/v2.5/${token}${rest || '/'}`, url.searchParams)
      return forward(`${UPSTREAM.caiyun}${path}`, request.method, quotaHeaders)
    }

    if (provider === 'waqi') {
      const token = env.WAQI_TOKEN || 'demo'
      const path = withSearch(rest || '/', url.searchParams, (sp) => {
        if (!sp.get('token')) sp.set('token', token)
      })
      return forward(`${UPSTREAM.waqi}${path}`, request.method, quotaHeaders)
    }

    if (provider === 'qweather') {
      const key = env.QWEATHER_KEY || env.HEWEATHER_KEY || ''
      if (!key) return jsonError('QWEATHER_KEY missing', 500)
      const hostRaw = (env.QWEATHER_HOST || UPSTREAM.qweather).replace(/\/+$/, '')
      const base = hostRaw.startsWith('http') ? hostRaw : `https://${hostRaw}`
      const path = withSearch(rest || '/', url.searchParams, (sp) => {
        if (!sp.get('key')) sp.set('key', key)
        if (!sp.get('lang')) sp.set('lang', 'zh')
      })
      return forward(`${base}${path}`, request.method, quotaHeaders)
    }

    return jsonError('unknown provider', 404)
  } catch (e) {
    return jsonError(e?.message || 'proxy failed', 502)
  }
}

/** 上游 fetch 超时（避免拖满 Edge 执行时长） */
export const UPSTREAM_TIMEOUT_MS = 8000

async function forward(target, method, extraHeaders = {}) {
  let signal
  try {
    // Edge / 现代运行时支持 AbortSignal.timeout
    signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  } catch {
    const c = new AbortController()
    signal = c.signal
    setTimeout(() => c.abort(), UPSTREAM_TIMEOUT_MS)
  }

  let res
  try {
    res = await fetch(target, {
      method,
      headers: {
        accept: 'application/json',
        'user-agent': 'pm25-match-proxy/1.0',
      },
      redirect: 'follow',
      signal,
    })
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      return jsonError('upstream timeout', 504)
    }
    throw e
  }

  const headers = new Headers()
  const ct = res.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  headers.set('cache-control', 'public, max-age=60')
  for (const [k, v] of Object.entries(extraHeaders || {})) {
    if (v != null && v !== '') headers.set(k, String(v))
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

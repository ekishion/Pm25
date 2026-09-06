/**
 * 同源 /api 代理核心（Vite dev/preview · Vercel Edge · Cloudflare Pages 共用）
 * 密钥只从运行时 env 读取，永不进入前端包
 *
 * CSRF / 盗刷防护：
 * 1) 必须带自定义头 X-Match-Client（跨站简单请求带不上；带上会触发 CORS 预检，我们不放行）
 * 2) 若有 Origin / Referer，必须与当前站点同源
 *
 * 日配额：env.DAILY_API_LIMIT（默认 500，≤0 不限制）
 * - 扣费时机：密钥校验通过、真正转发上游前预扣 1
 * - 缺密钥 / 未知 provider 的注定失败请求不占额度
 * - 上游 5xx / 超时（未产生有效数据）退还该次额度（尽力而为，仅同 isolate 有效）
 */

import { parseDailyLimit, takeQuota, refundQuota } from './quota.mjs'

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
 * CSRF 校验核心（Fetch Request 共用）
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

function withSearch(path, searchParams, mutator) {
  const u = new URL(path, 'https://placeholder.local')
  for (const [k, v] of searchParams.entries()) {
    if (!u.searchParams.has(k)) u.searchParams.set(k, v)
  }
  if (mutator) mutator(u.searchParams)
  return u.pathname + u.search
}

/** 高德仅支持 IPv4 定位 */
function isIpv4(s) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(s || '').trim())
}

/**
 * 提取真实客户端 IPv4（高德 IP 定位用）。
 * 优先平台注入头（CF-Connecting-IP / x-real-ip）；X-Forwarded-For 取最右一项：
 * 最左由客户端可伪造，最右由最近一跳可信代理追加。
 * 仅接受 IPv4（高德限制），IPv6 / 缺失返回 ''。
 */
export function extractClientIp(headers) {
  if (!headers || typeof headers.get !== 'function') return ''
  const single = (v) => {
    const s = String(v || '').trim()
    return isIpv4(s) ? s : ''
  }
  const direct =
    single(headers.get('cf-connecting-ip')) || single(headers.get('x-real-ip'))
  if (direct) return direct
  const xff = String(headers.get('x-forwarded-for') || '')
  for (const part of xff.split(',').reverse()) {
    const hit = single(part)
    if (hit) return hit
  }
  return ''
}

/**
 * 校验密钥并构造上游 URL。缺密钥 / 未知 provider 返回 { error }（不占日配额）。
 * @returns {{ url?: string, error?: Response }}
 */
export function resolveUpstreamTarget({ provider, env, rest, searchParams, headers }) {
  if (provider === 'amap') {
    const key = env.AMAP_KEY || ''
    if (!key) return { error: jsonError('AMAP_KEY missing', 500) }
    const isIpLocate = (rest || '') === '/v3/ip'
    const path = withSearch(rest || '/', searchParams, (sp) => {
      if (!sp.get('key')) sp.set('key', key)
      // IP 定位缺省参数时注入代理可见的客户端 IP：
      // 浏览器直连的 IP 服务常被 CORS 挡，定位线索在服务端补齐
      if (isIpLocate && !sp.get('ip')) {
        const ip = extractClientIp(headers)
        if (ip) sp.set('ip', ip)
      }
    })
    return { url: `${UPSTREAM.amap}${path}` }
  }

  if (provider === 'caiyun') {
    const token = env.CAIYUN_TOKEN || ''
    if (!token) return { error: jsonError('CAIYUN_TOKEN missing', 500) }
    // 客户端: /api/caiyun/{lon},{lat}/realtime.json
    // 上游:   /v2.5/{token}/{lon},{lat}/realtime.json
    const path = withSearch(`/v2.5/${token}${rest || '/'}`, searchParams)
    return { url: `${UPSTREAM.caiyun}${path}` }
  }

  if (provider === 'waqi') {
    // 不再回退 demo token（全球共享、基本必限流），与其余源一致缺配置即 500
    const token = env.WAQI_TOKEN || ''
    if (!token) return { error: jsonError('WAQI_TOKEN missing', 500) }
    const path = withSearch(rest || '/', searchParams, (sp) => {
      if (!sp.get('token')) sp.set('token', token)
    })
    return { url: `${UPSTREAM.waqi}${path}` }
  }

  if (provider === 'qweather') {
    const key = env.QWEATHER_KEY || env.HEWEATHER_KEY || ''
    if (!key) return { error: jsonError('QWEATHER_KEY missing', 500) }
    const hostRaw = (env.QWEATHER_HOST || UPSTREAM.qweather).replace(/\/+$/, '')
    const base = hostRaw.startsWith('http') ? hostRaw : `https://${hostRaw}`
    const path = withSearch(rest || '/', searchParams, (sp) => {
      if (!sp.get('key')) sp.set('key', key)
      if (!sp.get('lang')) sp.set('lang', 'zh')
    })
    return { url: `${base}${path}` }
  }

  return { error: jsonError('unknown provider', 404) }
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

  // 缺密钥 / 未知 provider：在扣配额之前返回
  const target = resolveUpstreamTarget({
    provider,
    env: env || {},
    rest,
    searchParams: url.searchParams,
    headers: request.headers,
  })
  if (target.error) return target.error

  // 日配额：预扣 1；上游 5xx / 超时未产生有效数据时退还
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

  const quotaHeaders = {
    'x-match-quota-limit': String(quota.limit || 0),
    'x-match-quota-remaining':
      quota.remaining === Infinity ? '' : String(quota.remaining),
  }

  try {
    const res = await forward(target.url, request.method, quotaHeaders)
    if (res.status >= 500) refundQuota({ limit, key: 'api' })
    return res
  } catch (e) {
    refundQuota({ limit, key: 'api' })
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

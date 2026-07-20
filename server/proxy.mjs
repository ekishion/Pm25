/**
 * 同源 /api 代理核心（Vercel Edge / Cloudflare Pages 共用）
 * 密钥只从运行时 env 读取，永不进入前端包
 *
 * CSRF / 盗刷防护：
 * 1) 必须带自定义头 X-Match-Client（跨站简单请求带不上；带上会触发 CORS 预检，我们不放行）
 * 2) 若有 Origin / Referer，必须与当前站点同源
 */

const UPSTREAM = {
  amap: 'https://restapi.amap.com',
  caiyun: 'https://api.caiyunapp.com',
  waqi: 'https://api.waqi.info',
  qweather: 'https://devapi.qweather.com',
}

/** 与前端 http.js 保持一致 */
export const CLIENT_HEADER = 'x-match-client'
export const CLIENT_HEADER_VALUE = '1'

export function jsonError(message, status = 502) {
  return new Response(JSON.stringify({ status: 'error', info: message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
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
 * CSRF / 跨站盗用检查。通过返回 null，拒绝返回 Response。
 * @param {Request} request
 * @returns {Response|null}
 */
export function assertTrustedClient(request) {
  // 预检：不提供 CORS 放行头，直接拒绝
  if (request.method === 'OPTIONS') {
    return jsonError('forbidden', 403)
  }

  const marker = request.headers.get(CLIENT_HEADER)
  if (marker !== CLIENT_HEADER_VALUE) {
    return jsonError('forbidden', 403)
  }

  const reqUrl = new URL(request.url)
  const reqOrigin = reqUrl.origin

  const origin = request.headers.get('origin')
  if (origin) {
    if (origin !== reqOrigin) {
      return jsonError('forbidden origin', 403)
    }
    return null
  }

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      if (new URL(referer).origin !== reqOrigin) {
        return jsonError('forbidden referer', 403)
      }
    } catch {
      return jsonError('forbidden referer', 403)
    }
  }

  // 同源 fetch 可能无 Origin/Referer；自定义头已校验，放行
  return null
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

  try {
    if (provider === 'amap') {
      const key = env.AMAP_KEY || ''
      if (!key) return jsonError('AMAP_KEY missing', 500)
      const path = withSearch(rest || '/', url.searchParams, (sp) => {
        if (!sp.get('key')) sp.set('key', key)
      })
      return forward(`${UPSTREAM.amap}${path}`, request.method)
    }

    if (provider === 'caiyun') {
      const token = env.CAIYUN_TOKEN || ''
      if (!token) return jsonError('CAIYUN_TOKEN missing', 500)
      // 客户端: /api/caiyun/{lon},{lat}/realtime.json
      // 上游:   /v2.5/{token}/{lon},{lat}/realtime.json
      const path = withSearch(`/v2.5/${token}${rest || '/'}`, url.searchParams)
      return forward(`${UPSTREAM.caiyun}${path}`, request.method)
    }

    if (provider === 'waqi') {
      const token = env.WAQI_TOKEN || 'demo'
      const path = withSearch(rest || '/', url.searchParams, (sp) => {
        if (!sp.get('token')) sp.set('token', token)
      })
      return forward(`${UPSTREAM.waqi}${path}`, request.method)
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
      return forward(`${base}${path}`, request.method)
    }

    return jsonError('unknown provider', 404)
  } catch (e) {
    return jsonError(e?.message || 'proxy failed', 502)
  }
}

async function forward(target, method) {
  const res = await fetch(target, {
    method,
    headers: {
      accept: 'application/json',
      'user-agent': 'pm25-match-proxy/1.0',
    },
    redirect: 'follow',
  })

  const headers = new Headers()
  const ct = res.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  headers.set('cache-control', 'public, max-age=60')

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

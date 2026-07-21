/**
 * Vercel Edge catch-all: /api/*
 * 避免嵌套 api/amap/[...path] 在部分 Vite 部署下 NOT_FOUND
 *
 * Env: AMAP_KEY, QWEATHER_KEY, QWEATHER_HOST, CAIYUN_TOKEN, WAQI_TOKEN
 */
import { proxyProvider, jsonError } from '../server/proxy.mjs'

export const config = { runtime: 'edge' }

export default async function handler(request) {
  const url = new URL(request.url)
  // /api/amap/v3/... → provider=amap, suffix=/v3/...
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const provider = parts[0]
  if (!provider) return jsonError('not found', 404)

  const pathSuffix = parts.length > 1 ? `/${parts.slice(1).join('/')}` : '/'

  return proxyProvider(request, {
    provider,
    env: {
      AMAP_KEY: process.env.AMAP_KEY,
      QWEATHER_KEY: process.env.QWEATHER_KEY || process.env.HEWEATHER_KEY,
      QWEATHER_HOST: process.env.QWEATHER_HOST,
      CAIYUN_TOKEN: process.env.CAIYUN_TOKEN,
      WAQI_TOKEN: process.env.WAQI_TOKEN || 'demo',
      DAILY_API_LIMIT: process.env.DAILY_API_LIMIT,
    },
    pathSuffix,
  })
}

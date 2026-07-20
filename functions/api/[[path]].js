/**
 * Cloudflare Pages catch-all: /api/*
 * 与 Vercel api/[...path].js 对齐，避免多文件路由遗漏
 */
import { proxyProvider, jsonError } from '../../server/proxy.mjs'

export async function onRequest(context) {
  const { request, env, params } = context
  const parts = params.path
  const segs = Array.isArray(parts) ? parts : parts ? [parts] : []
  const provider = segs[0]
  if (!provider) return jsonError('not found', 404)

  const pathSuffix = segs.length > 1 ? `/${segs.slice(1).join('/')}` : '/'

  return proxyProvider(request, {
    provider,
    env: {
      AMAP_KEY: env.AMAP_KEY,
      QWEATHER_KEY: env.QWEATHER_KEY || env.HEWEATHER_KEY,
      QWEATHER_HOST: env.QWEATHER_HOST,
      CAIYUN_TOKEN: env.CAIYUN_TOKEN,
      WAQI_TOKEN: env.WAQI_TOKEN || 'demo',
    },
    pathSuffix,
  })
}

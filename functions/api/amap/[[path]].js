/**
 * Cloudflare Pages Function: /api/amap/*
 * Dashboard → Settings → Environment variables → AMAP_KEY
 */
import { proxyProvider } from '../../../server/proxy.mjs'

export async function onRequest(context) {
  const { request, env, params } = context
  const parts = params.path
  const pathSuffix = Array.isArray(parts)
    ? `/${parts.join('/')}`
    : parts
      ? `/${parts}`
      : '/'

  return proxyProvider(request, {
    provider: 'amap',
    env: {
      AMAP_KEY: env.AMAP_KEY,
    },
    pathSuffix,
  })
}

/**
 * Cloudflare Pages Function: /api/waqi/*
 * Dashboard → Settings → Environment variables → WAQI_TOKEN（可选）
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
    provider: 'waqi',
    env: {
      WAQI_TOKEN: env.WAQI_TOKEN || 'demo',
    },
    pathSuffix,
  })
}

/**
 * Cloudflare Pages Function: /api/qweather/*
 * Env: QWEATHER_KEY（或 HEWEATHER_KEY）、可选 QWEATHER_HOST
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
    provider: 'qweather',
    env: {
      QWEATHER_KEY: env.QWEATHER_KEY || env.HEWEATHER_KEY,
      QWEATHER_HOST: env.QWEATHER_HOST,
    },
    pathSuffix,
  })
}

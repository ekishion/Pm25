/**
 * Vercel Edge: /api/qweather/*
 * Env: QWEATHER_KEY（或 HEWEATHER_KEY）、可选 QWEATHER_HOST
 */
import { proxyProvider } from '../../server/proxy.mjs'

export const config = { runtime: 'edge' }

export default async function handler(request) {
  const url = new URL(request.url)
  const prefix = '/api/qweather'
  const pathSuffix = url.pathname.startsWith(prefix)
    ? url.pathname.slice(prefix.length) || '/'
    : url.pathname

  return proxyProvider(request, {
    provider: 'qweather',
    env: {
      QWEATHER_KEY: process.env.QWEATHER_KEY || process.env.HEWEATHER_KEY,
      QWEATHER_HOST: process.env.QWEATHER_HOST,
    },
    pathSuffix,
  })
}

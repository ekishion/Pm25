/**
 * Vercel Edge: /api/waqi/*
 * Env: WAQI_TOKEN（可选，默认 demo）
 */
import { proxyProvider } from '../../server/proxy.mjs'

export const config = { runtime: 'edge' }

export default async function handler(request) {
  const url = new URL(request.url)
  const prefix = '/api/waqi'
  const pathSuffix = url.pathname.startsWith(prefix)
    ? url.pathname.slice(prefix.length) || '/'
    : url.pathname

  return proxyProvider(request, {
    provider: 'waqi',
    env: {
      WAQI_TOKEN: process.env.WAQI_TOKEN || 'demo',
    },
    pathSuffix,
  })
}

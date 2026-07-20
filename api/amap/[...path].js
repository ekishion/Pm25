/**
 * Vercel Edge: /api/amap/*
 * Env: AMAP_KEY
 */
import { proxyProvider } from '../../server/proxy.mjs'

export const config = { runtime: 'edge' }

export default async function handler(request) {
  const url = new URL(request.url)
  const prefix = '/api/amap'
  const pathSuffix = url.pathname.startsWith(prefix)
    ? url.pathname.slice(prefix.length) || '/'
    : url.pathname

  return proxyProvider(request, {
    provider: 'amap',
    env: {
      AMAP_KEY: process.env.AMAP_KEY,
    },
    pathSuffix,
  })
}

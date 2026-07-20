/**
 * Vercel Edge: /api/caiyun/*
 * Env: CAIYUN_TOKEN
 */
import { proxyProvider } from '../../server/proxy.mjs'

export const config = { runtime: 'edge' }

export default async function handler(request) {
  const url = new URL(request.url)
  const prefix = '/api/caiyun'
  const pathSuffix = url.pathname.startsWith(prefix)
    ? url.pathname.slice(prefix.length) || '/'
    : url.pathname

  return proxyProvider(request, {
    provider: 'caiyun',
    env: {
      CAIYUN_TOKEN: process.env.CAIYUN_TOKEN,
    },
    pathSuffix,
  })
}

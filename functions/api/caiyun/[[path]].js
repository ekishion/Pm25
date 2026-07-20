/**
 * Cloudflare Pages Function: /api/caiyun/*
 * Dashboard → Settings → Environment variables → CAIYUN_TOKEN
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
    provider: 'caiyun',
    env: {
      CAIYUN_TOKEN: env.CAIYUN_TOKEN,
    },
    pathSuffix,
  })
}

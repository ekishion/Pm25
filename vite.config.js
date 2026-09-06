import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { proxyProvider } from './server/proxy.mjs'

/**
 * 密钥只存在于 Node 进程（非 VITE_ 前缀），不会打进浏览器包。
 * 前端一律请求同源 /api/*；dev/preview 与线上 Edge（Vercel / Cloudflare）
 * 共用同一个代理核心 server/proxy.mjs —— CSRF、日配额、缺 key 短路、
 * 失败退还、客户端 IP 提取只维护一份，避免两套实现 drift。
 */

const API_PROVIDER_RE = /^\/api\/(amap|caiyun|waqi|qweather)(\/|$)/

/** Node req/res ↔ Fetch Request/Response 桥接 */
async function handleApi(req, res, env) {
  let url
  try {
    url = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`)
  } catch {
    res.statusCode = 400
    res.end()
    return
  }

  try {
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
    })
    const provider = API_PROVIDER_RE.exec(url.pathname)?.[1] || ''
    const response = await proxyProvider(request, { provider, env })
    const body = new Uint8Array(await response.arrayBuffer())
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
    res.end(body)
  } catch (e) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ status: 'error', info: e?.message || 'proxy failed' }))
  }
}

function apiProxyPlugin(env = {}) {
  const handler = (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next()
    return handleApi(req, res, env)
  }
  return {
    name: 'match-api-proxy',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue(), apiProxyPlugin(env)],
    envPrefix: ['VITE_'],
    test: {
      environment: 'node',
      include: ['src/**/*.test.js', 'server/**/*.test.js'],
    },
    build: {
      sourcemap: false,
      cssCodeSplit: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 600,
      minify: 'esbuild',
      target: 'es2020',
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
        },
      },
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
      legalComments: 'none',
    },
    server: {
      host: true,
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
  }
})

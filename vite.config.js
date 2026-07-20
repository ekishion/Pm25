import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from './server/proxy.mjs'

/**
 * 密钥只存在于 Node 进程（非 VITE_ 前缀），不会打进浏览器包。
 * 前端一律请求同源 /api/*，由代理注入 key/token。
 * 与线上一致：必须带 X-Match-Client，且 Origin/Referer 同源。
 */

function isTrustedApiRequest(req) {
  const marker = req.headers[CLIENT_HEADER] || req.headers['x-match-client']
  if (String(marker) !== CLIENT_HEADER_VALUE) return false

  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const selfOrigin = `${proto}://${String(host).split(',')[0].trim()}`

  const origin = req.headers.origin
  if (origin && origin !== selfOrigin) return false

  const referer = req.headers.referer
  if (referer) {
    try {
      if (new URL(referer).origin !== selfOrigin) return false
    } catch {
      return false
    }
  }
  return true
}

function apiGuardPlugin() {
  const guard = (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next()
    if (req.method === 'OPTIONS') {
      res.statusCode = 403
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ status: 'error', info: 'forbidden' }))
      return
    }
    if (!isTrustedApiRequest(req)) {
      res.statusCode = 403
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ status: 'error', info: 'forbidden' }))
      return
    }
    next()
  }
  return {
    name: 'match-api-csrf-guard',
    configureServer(server) {
      server.middlewares.use(guard)
    },
    configurePreviewServer(server) {
      server.middlewares.use(guard)
    },
  }
}

function buildProxy(env) {
  const amapKey = env.AMAP_KEY || ''
  const caiyunToken = env.CAIYUN_TOKEN || ''
  const waqiToken = env.WAQI_TOKEN || 'demo'
  const qweatherKey = env.QWEATHER_KEY || env.HEWEATHER_KEY || ''
  const qweatherHost = (env.QWEATHER_HOST || 'https://devapi.qweather.com').replace(
    /\/+$/,
    '',
  )
  const qweatherTarget = qweatherHost.startsWith('http')
    ? qweatherHost
    : `https://${qweatherHost}`

  return {
    '/api/amap': {
      target: 'https://restapi.amap.com',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/amap/, ''),
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq, req) => {
          if (!amapKey) return
          try {
            const url = new URL(req.url || '', 'http://local')
            if (!url.searchParams.get('key')) {
              url.searchParams.set('key', amapKey)
              proxyReq.path = url.pathname + url.search
            }
          } catch {
            /* ignore malformed path */
          }
        })
      },
    },
    '/api/qweather': {
      target: qweatherTarget,
      changeOrigin: true,
      // 无 Key 时短路，避免上游 403 难排查
      bypass(req, res) {
        if (!qweatherKey) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ status: 'error', info: 'QWEATHER_KEY missing' }))
          return true
        }
      },
      rewrite: (path) => path.replace(/^\/api\/qweather/, ''),
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq, req) => {
          try {
            const url = new URL(req.url || '', 'http://local')
            if (!url.searchParams.get('key')) {
              url.searchParams.set('key', qweatherKey)
            }
            if (!url.searchParams.get('lang')) {
              url.searchParams.set('lang', 'zh')
            }
            proxyReq.path = url.pathname + url.search
          } catch {
            /* ignore */
          }
        })
      },
    },
    '/api/caiyun': {
      target: 'https://api.caiyunapp.com',
      changeOrigin: true,
      rewrite: (path) => {
        const rest = path.replace(/^\/api\/caiyun/, '')
        if (!caiyunToken) return `/v2.5/invalid${rest}`
        return `/v2.5/${caiyunToken}${rest}`
      },
    },
    '/api/waqi': {
      target: 'https://api.waqi.info',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/waqi/, ''),
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq, req) => {
          try {
            const url = new URL(req.url || '', 'http://local')
            if (!url.searchParams.get('token')) {
              url.searchParams.set('token', waqiToken)
              proxyReq.path = url.pathname + url.search
            }
          } catch {
            /* ignore */
          }
        })
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = buildProxy(env)

  return {
    plugins: [vue(), apiGuardPlugin()],
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
      proxy,
    },
    preview: {
      host: true,
      port: 4173,
      proxy,
    },
  }
})

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 密钥只存在于 Node 进程（非 VITE_ 前缀），不会打进浏览器包。
 * 前端一律请求同源 /api/*，由代理注入 key/token。
 */
function buildProxy(env) {
  const amapKey = env.AMAP_KEY || ''
  const caiyunToken = env.CAIYUN_TOKEN || ''
  const waqiToken = env.WAQI_TOKEN || 'demo'

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
    '/api/caiyun': {
      target: 'https://api.caiyunapp.com',
      changeOrigin: true,
      rewrite: (path) => {
        const rest = path.replace(/^\/api\/caiyun/, '')
        // 无 token 时不拼假 token，交给上游失败
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
  // 第三个参数 '' = 加载全部 env，含非 VITE_ 密钥
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = buildProxy(env)

  return {
    plugins: [vue()],
    // 不把任何服务端密钥以 define 形式注入客户端
    envPrefix: ['VITE_'],
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],
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
          // 避免可读的源文件路径片段
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
        },
      },
    },
    esbuild: {
      // 生产去掉 console / debugger，减少信息面
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

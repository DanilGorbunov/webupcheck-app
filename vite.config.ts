import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      port: 3003,
      proxy: {
        '/medialister-api': {
          target: 'https://api.medialister.com',
          changeOrigin: true,
          secure: true,
          rewrite: path => path.replace(/^\/medialister-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('apikey', env.VITE_MEDIALISTER_API_KEY)
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (compatible; PRNEWS-Monitor/1.0)')
            })
          },
        },
      },
    },
  }
})

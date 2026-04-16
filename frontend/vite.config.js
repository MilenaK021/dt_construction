import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('[proxy error]', err.message)
          })
          proxy.on('proxyReq', (_, req) => {
            console.log('[proxy →]', req.method, req.url)
          })
          proxy.on('proxyRes', (res, req) => {
            console.log('[proxy ←]', res.statusCode, req.url)
          })
        }
      }
    }
  }
})
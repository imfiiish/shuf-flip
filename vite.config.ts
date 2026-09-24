import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 开发期把 /api 转发到本地后端；浏览器看仍是同源（5173），Cookie 才带得上
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

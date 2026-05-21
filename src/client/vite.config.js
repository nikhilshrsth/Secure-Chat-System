import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const projectDir = new URL('.', import.meta.url).pathname

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read the server's .env so the proxy target always matches the server PORT
  const serverEnv = loadEnv(mode, resolve(projectDir, '../server'), '')
  const serverPort = serverEnv.PORT || '3000'
  // Pin to 127.0.0.1 (not "localhost") to avoid Node 22 IPv6/IPv4 dual-stack
  // ECONNREFUSED errors from http-proxy-middleware.
  const proxyTarget = `http://127.0.0.1:${serverPort}`

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})

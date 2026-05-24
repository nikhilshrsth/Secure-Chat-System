import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
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
    plugins: [react(), basicSsl()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom') || id.includes('react-router') || id.includes('react/')) {
                return 'vendor-react'
              }
              if (id.includes('socket.io')) {
                return 'vendor-socket'
              }
              return 'vendor-misc'
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      https: true,
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

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const projectDir = new URL('.', import.meta.url).pathname

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read the server's .env so the proxy target always matches the server PORT
  const serverEnv = loadEnv(mode, resolve(projectDir, '../server'), '')
  const serverPort = serverEnv.PORT || '3000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
        '/socket.io': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})

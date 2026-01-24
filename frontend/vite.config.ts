import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
        // Proxy API requests to FastAPI backend
        '/api': {
            target: 'http://localhost:8000',
            changeOrigin: true,
            secure: false,
        },
        // Proxy React template admin to Django admin (8086 -> 8080/react/admin)
        '/react/admin': {
            target: 'http://localhost:8086',
            changeOrigin: true,
            secure: false,
            rewrite: (path) => path.replace(/^\/react\/admin/, '/admin'),
        }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})

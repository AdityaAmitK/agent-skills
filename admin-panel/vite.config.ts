import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// A static single-page app. The backend serves dist/ and answers /api/* on the
// same origin, so session cookies and the X-Panel-Request header just work.
// In development, /api is proxied to ADMIN_API (default http://127.0.0.1:8790).
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': process.env.ADMIN_API || 'http://127.0.0.1:8790' } },
})

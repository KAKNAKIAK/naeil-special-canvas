import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 4173, strictPort: true },
  preview: { port: 4174, strictPort: true },
  build: { target: 'es2022' },
})

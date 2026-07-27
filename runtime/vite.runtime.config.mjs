import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dependency = (name) => path.join(here, 'node_modules', name)

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: [
      { find: /^react-dom(\/.*)?$/, replacement: `${dependency('react-dom')}$1` },
      { find: /^react(\/.*)?$/, replacement: `${dependency('react')}$1` },
      { find: /^lucide-react$/, replacement: dependency('lucide-react') },
      { find: /^yaml$/, replacement: dependency('yaml') },
      { find: /^jszip$/, replacement: dependency('jszip') },
      { find: /^html-to-image$/, replacement: dependency('html-to-image') },
      { find: /^idb-keyval$/, replacement: dependency('idb-keyval') },
    ],
  },
  server: { port: 4173, strictPort: true },
  preview: { port: 4174, strictPort: true },
  build: { target: 'es2022' },
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})

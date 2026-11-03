import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Production-only CSP, so dev-server hot reload (inline scripts) keeps working.
const csp = {
  name: 'csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) =>
    html.replace(
      '<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:">`,
    ),
}

export default defineConfig({
  main: {
    build: {
      // node:sqlite is a prefix-only builtin; make sure the bundler leaves it alone.
      rollupOptions: { input: resolve('electron/main.ts'), external: ['node:sqlite'] },
    },
  },
  preload: { build: { rollupOptions: { input: resolve('electron/preload.ts') } } },
  renderer: {
    root: '.',
    build: { rollupOptions: { input: resolve('index.html') } },
    plugins: [react(), tailwindcss(), csp],
  },
})

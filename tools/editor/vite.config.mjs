import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({ root: fileURLToPath(new URL('../../src/editor', import.meta.url)), base: '/__motioneer/editor/', plugins: [react()], build: { outDir: '../../dist-editor', emptyOutDir: true } })

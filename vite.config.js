import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    assetsDir: 'static',
    rollupOptions: {
      output: {
        entryFileNames: 'static/app-[hash].js',
        chunkFileNames: 'static/chunk-[name]-[hash].js',
        assetFileNames: 'static/[name]-[hash][extname]',
      },
    },
    sourcemap: false,
  }
})

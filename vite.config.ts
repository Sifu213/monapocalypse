import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Force Rollup to use JS version instead of native binaries
process.env.ROLLUP_NO_NATIVE = '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: './postcss.config.js',
  },
  build: {
    target: 'es2015',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      }
    }
  },
  esbuild: {
    target: 'es2015'
  }
})
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Force Rollup to use JS version instead of native binaries
process.env.ROLLUP_NO_NATIVE = '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      }
    }
  }
})
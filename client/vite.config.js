import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // This is the new official plugin
  ],
  build: {
    rollupOptions: {
      // This tells Vite to ignore these Node.js-specific modules
      // preventing the build from crashing.
      external: ['fs', 'path', 'os'],
    },
  },
})

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules\/(react|react-dom|scheduler)/ },
            { name: 'd3', test: /node_modules\/d3/ },
            { name: 'motion', test: /node_modules\/(framer-motion|motion|motion-dom)/ },
            { name: 'i18n', test: /node_modules\/(i18next|react-i18next)/ },
            { name: 'dnd', test: /node_modules\/@dnd-kit/ },
          ],
        },
      },
    },
  },
})

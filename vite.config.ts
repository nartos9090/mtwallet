/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Wallet',
        short_name: 'Wallet',
        description: 'Personal finance tracker synced to Google Sheets',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // Runs in a container: listen on all interfaces, on the port docker-compose publishes.
    host: true,
    port: 5173,
    strictPort: true,
    // Reached through the dev proxy as <project>.test.
    allowedHosts: ['.test'],
  },
  test: {
    environment: 'node',
  },
})

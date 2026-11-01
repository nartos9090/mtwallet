/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { markdown } from './plugins/markdown.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Legal pages (src/legal/*.md), filled from .env.
      markdown({
        appName: env.VITE_APP_NAME || 'Wallet',
        operator: env.VITE_LEGAL_OPERATOR,
        contactEmail: env.VITE_LEGAL_CONTACT_EMAIL,
        website: env.VITE_LEGAL_WEBSITE,
        governingLaw: env.VITE_LEGAL_GOVERNING_LAW,
      }),
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
      // The auth service (auth-service/, `bun run dev` at the repo root starts both).
      // Keep the browser's Host: the service compares it with the request's Origin.
      proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
    },
    test: {
      environment: 'node',
    },
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Gyana — AI-Powered Learning',
        short_name: 'Gyana',
        description: 'AI-powered Learning Management System',
        theme_color: '#10B981',
        background_color: '#064E3B',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Skip auth/API routes — those need live data + cookies
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/instructor/, /^\/student/, /^\/admin/, /^\/super-admin/, /^\/chatbots/, /^\/notifications/, /^\/uploads/, /^\/pdfs/],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'gyana-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // keep SW off during dev to avoid stale-cache confusion
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      // Proxy all API routes to backend
      '/instructor': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/student': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/chatbots': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/super-admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/pdfs': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})

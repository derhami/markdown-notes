import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Markdown Notes',
          short_name: 'MdNotes',
          description: 'A local-first, offline-friendly Markdown writing workspace.',
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#3E5A80',
          background_color: '#FAF9F6',
          categories: ['productivity', 'utilities'],
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/pwa-512x512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'markdown': ['react-markdown', 'remark-gfm'],
            'data': ['dexie', 'dexie-react-hooks'],
            'state': ['zustand'],
            'icons': ['lucide-react']
          }
        }
      }
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
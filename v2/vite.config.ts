import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Inline service worker strategy — no separate sw.js file to manage
      injectRegister: 'auto',
      workbox: {
        // Cache the app shell
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Never cache Firebase RTDB calls
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Firebase RTDB — network only, never cache
            urlPattern: /^https:\/\/bangle-tracker-default-rtdb\.firebaseio\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // R2 images — cache first with 30-day expiry
            urlPattern: /^https:\/\/pub-0df3d745e87346ad8148f93b28cc4bac\.r2\.dev\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bangle-r2-images-v1',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30, maxEntries: 200 },
            },
          },
          {
            // Google Fonts — cache first
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'bangle-fonts-v1', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      manifest: {
        name: 'Siddhi Bangle Tracker',
        short_name: 'Bangle Tracker',
        description: 'Production management dashboard for Siddhi Bangles',
        theme_color: '#534AB7',
        background_color: '#0f0e1a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/?pwa=1',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});

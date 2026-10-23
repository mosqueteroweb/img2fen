import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: [
        'icons/*.png',
        'pieces/*.svg',
        'model/*.onnx',
        'wasm/*.wasm',
        'wasm/*.mjs',
      ],
      manifest: {
        name: 'Img2FEN - Diagramas a FEN de Ajedrez',
        short_name: 'Img2FEN',
        description: 'Convierte diagramas y fotos de ajedrez a FEN de forma 100% offline y privada.',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        share_target: {
          action: 'share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'image',
                accept: ['image/*', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']
              }
            ]
          }
        }
      },
      workbox: {
        importScripts: ['sw-share-target.js'],
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,wasm,onnx}'],
        // Img2FEN Pro (pwa/public/pro) tiene su propio service worker: no precachearla ni redirigir sus rutas
        globIgnores: ['pro/**'],
        navigateFallbackDenylist: [/\/pro\//],
        maximumFileSizeToCacheInBytes: 35 * 1024 * 1024, // Allow up to 35MB for WASM and ONNX
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.destination === 'image' ||
              request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /.*\.(?:wasm|onnx)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ai-models-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
});

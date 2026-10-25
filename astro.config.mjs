// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

// B2-Trainer — static output, no backend (v1).
export default defineConfig({
  site: process.env.SITE_URL || 'https://b2-trainer.pages.dev',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    preact({ compat: false }),
    sitemap(),
    AstroPWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'B2-Trainer — Deutsch B2 üben',
        short_name: 'B2-Trainer',
        description:
          'Latihan mandiri Leseverstehen & Hörenverstehen level B2 (Goethe-Zertifikat B2 / telc Deutsch B2).',
        lang: 'de',
        theme_color: '#1f6feb',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,json,txt}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'b2-trainer-audio',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/content/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'b2-trainer-content' }
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  vite: {
    // Astro bringt seine eigene vite-Kopie mit, vite-plugin-pwa eine weitere: die beiden
    // Plugin-Typen kollidieren nur auf Typebene (zur Laufzeit identisch) → JSDoc-Cast hält
    // `astro check` sauber, ohne die Funktion zu ändern.
    //
    // BUGFIX (Symlink): Projekt liegt real auf D:\, erreichbar über "C:\Users\asus\Antigravity draft".
    // Wird `astro build` über den C:-Pfad aufgerufen, verwirft Rollup ALLE CSS-Assets — still, ohne Fehler.
    // resolve.preserveSymlinks hält die Pfadauflösung konsistent → Build von C: und D: liefert CSS.
    resolve: { preserveSymlinks: true },
    plugins: [/** @type {any} */ (tailwindcss())]
  }
});

/// <reference types="vitest" />
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { componentTagger } from 'lovable-tagger';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'robots.txt', 'icon.svg'],
      manifest: {
        name: 'FrostGuard - Refrigeration Monitoring',
        short_name: 'FrostGuard',
        description:
          'Real-time refrigeration temperature monitoring and food safety compliance platform',
        theme_color: '#1e3a5f',
        background_color: '#f5f7fa',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['business', 'utilities', 'food'],
        icons: [
          {
            src: '/favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon',
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            description: 'View your monitoring dashboard',
            url: '/dashboard',
            icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
          {
            name: 'Log Temperature',
            short_name: 'Log Temp',
            description: 'Manually log a temperature reading',
            url: '/manual-log',
            icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
        ],
      },
      workbox: {
        // Exclude large PNGs from precaching (Telnyx opt-in image is 2.2MB)
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        // Increase limit to 5MB to accommodate large JS bundles
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    mode === 'production' &&
      (visualizer({
        filename: 'dist/stats.html',
        gzipSize: true,
      }) as PluginOption),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Suppress @stackframe internal circular re-export warnings (upstream package issue)
        if (warning.message?.includes('@stackframe/')) return;
        defaultHandler(warning);
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Order matters: more specific patterns first to avoid false matches
          if (id.includes('/@radix-ui/')) return 'vendor-ui';
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'vendor-charts';
          if (id.includes('/@tanstack/react-query') || id.includes('/@tanstack/query-core'))
            return 'vendor-query';
          if (
            id.includes('/react-hook-form/') ||
            id.includes('/@hookform/') ||
            id.includes('/zod/')
          )
            return 'vendor-forms';
          if (id.includes('/date-fns/')) return 'vendor-date';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
          if (id.includes('/socket.io') || id.includes('/engine.io')) return 'vendor-realtime';
          if (id.includes('/framer-motion/')) return 'vendor-motion';
          if (id.includes('/@stackframe/')) return 'vendor-auth';
          if (id.includes('/@trpc/')) return 'vendor-trpc';
          if (
            id.includes('/react-grid-layout/') ||
            id.includes('/react-resizable-panels/') ||
            id.includes('/react-resizable/')
          )
            return 'vendor-grid';
          // React core last — only match exact package names
          if (/\/node_modules\/\.pnpm\/(react-dom|react-router|scheduler|react)@/.test(id))
            return 'vendor-react';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
}));

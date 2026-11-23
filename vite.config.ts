import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const base = env.VITE_BASE_PATH || '/';

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Personal-Cashflow-Engine',
          short_name: 'Cashflow',
          description: 'Lokale Offline-PWA für Ideen, Einnahmen, Fixkosten und Schuldentilgung.',
          lang: 'de',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: base,
          scope: base,
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});

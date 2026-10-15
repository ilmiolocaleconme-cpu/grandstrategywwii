import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Configurazione PWA: tutto il necessario per giocare è nella cache (precache),
// quindi l'app deve aprirsi anche senza connessione dopo il primo caricamento.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // l'aggiornamento non sostituisce la versione mentre si gioca
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Grand Strategy WWII',
        short_name: 'GS WWII',
        description: 'Gioco di grande strategia ambientato nella Seconda guerra mondiale',
        lang: 'it',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1d2418',
        theme_color: '#1d2418',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,svg,ico,webmanifest}'],
        cleanupOutdatedCaches: true,
        // le province (data/provinces/, un file per nazione) e i fiumi sono chunk a sé, tutti nel precache; limite alto per prudenza (scripts/check-precache.js verifica dopo la build che non ne manchi nessuno)
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
});

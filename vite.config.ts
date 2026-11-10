import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

// BASE_PATH lets the same build work at "/" (local dev) and "/<repo-name>/" (GitHub Pages).
const base = process.env.BASE_PATH ?? '/';

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}+${gitSha()}`),
  },
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  plugins: [
    VitePWA({
      // 'prompt' = a new version waits until you tap "Update" (so a deploy never reloads mid-mission).
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Outpost Line',
        short_name: 'Outpost Line',
        description: 'Top-down military sci-fi tower defense.',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#0d0f0c',
        theme_color: '#0d0f0c',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything the game needs so it runs fully offline.
        globPatterns: ['**/*.{js,css,html,png,svg,json,webp,mp3,ogg,m4a,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
});

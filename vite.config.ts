import { defineConfig } from 'vite';
const solo = process.env.VITE_SOLO === '1';
export default defineConfig({
  base: solo ? './' : '/',
  // en développement, le serveur de jeu tourne à côté (npm run dev:server)
  server: { host: true, proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true } } },
  build: { target: 'es2020', outDir: solo ? 'dist-solo' : 'dist', chunkSizeWarningLimit: 2000, assetsInlineLimit: (f: string) => /\.woff2?$/.test(f) },
});

import { defineConfig } from 'vite';
const solo = process.env.VITE_SOLO === '1';
export default defineConfig({
  base: solo ? './' : '/',
  server: { host: true },
  build: { target: 'es2020', outDir: solo ? 'dist-solo' : 'dist', chunkSizeWarningLimit: 2000, assetsInlineLimit: (f: string) => /\.woff2?$/.test(f) },
});

import { defineConfig } from 'vite';

// VITE_SOLO=1 : version autonome (serveur de jeu embarqué), chemins relatifs pour être
// servie depuis n'importe quel dossier (aperçu publié, simple hébergement statique).
const solo = process.env.VITE_SOLO === '1';

export default defineConfig({
  base: solo ? './' : '/',
  server: {
    host: true,
    fs: { allow: ['..'] },
  },
  build: { target: 'es2020', outDir: solo ? 'dist-solo' : 'dist', chunkSizeWarningLimit: 1600 },
});

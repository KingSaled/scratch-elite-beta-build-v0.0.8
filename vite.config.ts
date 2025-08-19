/// <reference types="node" />
// vite.config.ts
import { defineConfig } from 'vite';

// Env switches:
//   GH_PAGES=1 -> base = '/REPO_NAME/'
//   default/ITCH/Netlify -> base = './'
const isGH = (process?.env?.GH_PAGES ?? '') === '1';
const repo = 'REPO_NAME'; // ← change to your GitHub repo name when using GH Pages

export default defineConfig({
  base: isGH ? `/${repo}/` : './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: false,
    // For itch: eliminate dynamic chunks to avoid iframe import quirks
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
        entryFileNames: 'assets/index-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    cssCodeSplit: false,
  },
});

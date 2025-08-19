/// <reference types="node" />
// vite.config.ts
import { defineConfig } from 'vite';

// Env switches:
//   GH_PAGES=1 -> base = '/REPO_NAME/'
//   default/ITCH/Netlify -> base = './'
const isGH = (process?.env?.GH_PAGES ?? '') === '1';
const repo = 'REPO_NAME'; // ← set this only if you actually use GH_PAGES=1

export default defineConfig({
  base: isGH ? `/${repo}/` : './',

  // Use Pixi's ESM entry to avoid the internal init-order issue you saw
  resolve: {
    alias: {
      // Works with Pixi v8: ESM entry point
      'pixi.js': 'pixi.js/dist/esm/index.mjs',
    },
  },
  optimizeDeps: {
    // Keep dev/prod consistent
    exclude: ['pixi.js'],
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,   // keep on while we verify
    minify: false,

    // Use default Rollup chunking (more stable than forcing inline chunks)
    // (intentionally no rollupOptions override)
    cssCodeSplit: false
  },
});

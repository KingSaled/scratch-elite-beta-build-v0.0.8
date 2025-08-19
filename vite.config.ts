/// <reference types="node" />
// vite.config.ts
import { defineConfig } from 'vite';

// Env switches:
//   GH_PAGES=1 -> base = '/REPO_NAME/'
//   default/ITCH/Netlify -> base = './'
const isGH = (process?.env?.GH_PAGES ?? '') === '1';
const repo = 'REPO_NAME'; // ← set this if you actually use GH_PAGES=1

export default defineConfig({
  base: isGH ? `/${repo}/` : './',

  // Use Pixi’s prebuilt ESM bundle to avoid internal module init-order issues
  resolve: {
    alias: {
      'pixi.js': 'pixi.js/dist/pixi.mjs',
    },
  },
  optimizeDeps: {
    exclude: ['pixi.js'],
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true, // keep on while we verify
    minify: false,

    // IMPORTANT: remove aggressive chunk inlining to prevent init-order bugs
    // (use Vite/Rollup defaults)
    // rollupOptions: { ... }  <-- intentionally omitted

    // Keep if you prefer single CSS file; OK either way.
    cssCodeSplit: false,
  },
});

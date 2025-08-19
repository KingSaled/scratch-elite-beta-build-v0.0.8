/// <reference types="node" />
// vite.config.ts
import { defineConfig } from 'vite';

const isGH = (process?.env?.GH_PAGES ?? '') === '1';
const repo = 'REPO_NAME'; // set only if you actually use GH_PAGES=1

export default defineConfig({
  base: isGH ? `/${repo}/` : './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,   // keep on while we verify
    minify: false,
    cssCodeSplit: false
  },
});

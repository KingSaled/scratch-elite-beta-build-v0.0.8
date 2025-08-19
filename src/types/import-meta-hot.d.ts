/// <reference types="vite/client" />

declare global {
  interface ImportMeta {
    readonly hot?: import('vite/types/hot').ViteHotContext;
  }
}
export {};

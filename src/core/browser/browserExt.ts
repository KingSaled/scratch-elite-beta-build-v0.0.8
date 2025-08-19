// src/core/browser/ext.ts
import { browserAll } from './all';

// example extra helpers that also must not import app code:
export function isWebGLSupported() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    );
  } catch {
    return false;
  }
}

export { browserAll };

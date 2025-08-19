// src/core/dom.ts
export function qs<T extends Element>(
  sel: string,
  root: ParentNode = document
) {
  return root.querySelector(sel) as T | null;
}

export function qsa<T extends Element>(
  sel: string,
  root: ParentNode = document
) {
  return Array.from(root.querySelectorAll(sel)) as T[];
}

export function byId<T extends Element>(id: string) {
  return document.getElementById(id) as T | null;
}

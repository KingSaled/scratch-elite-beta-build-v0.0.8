// src/core/storage.ts
// LocalStorage helpers + import/export utilities

export function loadJSON<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/security errors in dev
  }
}

/** Export any object as pretty JSON text (used by "Export JSON" button). */
export function exportStateText(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return '{}';
  }
}

/**
 * Parse imported JSON text safely and return a plain object.
 * We keep this permissive; state.ts will normalize anything important.
 */
export function parseImportedState(
  text: string
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

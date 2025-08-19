import { state, saveNow } from './state.js';
import { getTierById } from '../data/content.js';

/** Build a 6-letter prefix from the ticket name: first 3 letters of each word. */
export function serialPrefixForName(name: string): string {
  const parts = name
    .split(/[^A-Za-z0-9]+/g)
    .filter(Boolean)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''));
  const chunks: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    chunks.push(p.slice(0, 3).toUpperCase());
    if (chunks.join('').length >= 6) break; // cap at ~6
  }
  const joined = chunks.join('');
  return (joined || 'TICKET').slice(0, 6);
}

/** Get next serial string for a tier (increments the per-prefix counter). */
export function nextSerialForTier(tierId: string): string {
  const tier = getTierById(tierId);
  const prefix = serialPrefixForName(tier?.name || tierId);
  state.serialCounters = state.serialCounters || {};
  const next = (state.serialCounters[prefix] ?? 0) + 1;
  state.serialCounters[prefix] = next;
  saveNow();
  return `${prefix}-${String(next).padStart(6, '0')}`;
}

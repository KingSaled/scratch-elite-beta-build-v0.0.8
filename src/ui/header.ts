import { state } from '../core/state.js';

const FALLBACK_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
  <rect width="100%" height="100%" rx="12" fill="#111827"/>
  <circle cx="40" cy="32" r="16" fill="#374151"/>
  <rect x="14" y="54" width="52" height="16" rx="8" fill="#374151"/>
</svg>`);

function $<T extends HTMLElement = HTMLElement>(sel: string) {
  return document.querySelector<T>(sel);
}

function applyProfileToHeader(name?: string, avatarUrl?: string) {
  const nameEl = $('#tbUsername') as HTMLElement | null;
  const avaEl = $('#tbAvatar') as HTMLImageElement | null;

  const finalName =
    (typeof name === 'string' ? name : state.profile?.username) || 'Player';
  const finalAvatar =
    (typeof avatarUrl === 'string' ? avatarUrl : state.profile?.avatarUrl) ||
    FALLBACK_AVATAR;

  if (nameEl) nameEl.textContent = finalName;
  if (avaEl) {
    avaEl.alt = finalName;
    avaEl.src = finalAvatar;
  }
}

function applyMetaToHeader() {
  const daily = $('#tbDaily');
  const badgeC = $('#tbBadgeCount');

  // Daily progress (10-claim goal)
  if (daily) {
    const claimed = state.daily?.claimed ?? 0;
    const goal = 10;
    daily.textContent = `Daily ${Math.min(claimed, goal)}/${goal}`;
  }

  // Badge count (total unique earned)
  if (badgeC) {
    const total = Object.values(state.badges || {}).reduce(
      (acc, n) => acc + (n > 0 ? 1 : 0),
      0
    );
    badgeC.textContent = String(total);
  }

  // Level/Money/Tokens pills (kept in sync here too)
  const levelEl = $('#level');
  const moneyEl = $('#money');
  const tokensEl = $('#tokens');

  if (levelEl) levelEl.textContent = String(state.vendorLevel ?? 1);
  if (moneyEl) moneyEl.textContent = `$${(state.money ?? 0).toLocaleString()}`;
  if (tokensEl) tokensEl.textContent = String(state.tokens ?? 0);
}

/** Initial paint (and safe to call whenever you want a full refresh). */
export function initHeader() {
  refreshHeader();
}

/** Full refresh of profile + meta pills from saved state. */
export function refreshHeader() {
  applyProfileToHeader();
  applyMetaToHeader();
}

/** Live preview while editing in the Profile scene (does not save). */
export function previewHeaderProfile(name?: string, avatarUrl?: string) {
  applyProfileToHeader(name, avatarUrl);
}

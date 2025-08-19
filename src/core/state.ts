// src/core/state.ts
import { loadJSON, saveJSON } from './storage.js';
import { levelForXP } from './progression.js';
import { getTierById } from '../data/content.js';

export interface InventoryState {
  id: string;
  tierId: string;
  serialId: string;
  createdAt: number;
  state: 'sealed' | 'scratched' | 'claimed';
  ticket?: any;
}

export interface EquippedCosmetics {
  background?: string | null;
  avatarBorder?: string | null;
  theme?: string | null;
  title?: string | null;
  pet?: string | null;
  petBorder?: string | null;
}

export interface GameState {
  money: number;
  tokens: number;

  vendorXp: number;
  vendorLevel: number;

  lifetimeWinnings: number;

  unlocks: Record<string, boolean>;
  upgrades: Record<string, number>;

  firstClaims: Record<string, boolean>;

  daily: { day: string; claimed: number; awarded: boolean };

  claimsSinceToken: number;

  pityCount: number;
  backstopReady: boolean;

  streak: { expiresAt: number; steps: number; count: number };

  serialCounters: Record<string, number>;

  inventory: InventoryState[];

  flags: {
    autoReturn?: boolean;
    debugUnlockAll?: boolean;
    performanceMode?: boolean;
  };

  profile: {
    username: string;
    avatarUrl?: string;
    cosmetics: {
      owned: Record<string, true>;
      equipped: EquippedCosmetics;
    };
  };

  stats: {
    lifetimeSpent: number;
    ticketsScratched: number;
    tilesScratched: number;
    wins: number;
    losses: number;
    biggestWin: number;
    fastestClearMs: number | null;
    currentLossStreak: number;
    longestLossStreak: number;
    pityAvoids: number;
    tilePrizeCounts: Record<string, number>;
  };

  badges: Record<string, number>;
}

const KEY = 'scratch-elite-save-v1';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ===== Tuning =====
export const STREAK_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
export const STARTING_MONEY = 50;
const STAGE1_CLAIMS = 2;
const STAGE2_CLAIMS = 4;
const STAGE3_CLAIMS = 6;

const PITY_THRESHOLD = 6;
const BACKSTOP_FLOOR_PCT = 0.3;
const CLAIMS_PER_TOKEN = 15;

const defaultState: GameState = {
  money: STARTING_MONEY,
  tokens: 0,

  vendorXp: 0,
  vendorLevel: 1,

  lifetimeWinnings: 0,

  claimsSinceToken: 0,

  unlocks: {},
  upgrades: {},

  firstClaims: {},

  daily: { day: today(), claimed: 0, awarded: false },

  pityCount: 0,
  backstopReady: false,

  streak: { expiresAt: 0, steps: 0, count: 0 },

  serialCounters: {},

  inventory: [],

  flags: { autoReturn: true, debugUnlockAll: false, performanceMode: false },

  profile: {
    username: 'Player',
    avatarUrl: '',
    cosmetics: {
      owned: {},
      equipped: {},
    },
  },

  stats: {
    lifetimeSpent: 0,
    ticketsScratched: 0,
    tilesScratched: 0,
    wins: 0,
    losses: 0,
    biggestWin: 0,
    fastestClearMs: null,
    currentLossStreak: 0,
    longestLossStreak: 0,
    pityAvoids: 0,
    tilePrizeCounts: {},
  },

  badges: {},
};

export const state: GameState = Object.assign(
  {} as GameState,
  defaultState,
  loadJSON(KEY) ?? {}
);

// normalize / migrate
if (state.daily?.day !== today()) {
  state.daily = { day: today(), claimed: 0, awarded: false };
}
state.vendorLevel = Math.max(1, levelForXP(state.vendorXp ?? 0));
state.upgrades = state.upgrades || {};
state.pityCount = Math.max(0, state.pityCount ?? 0);
state.claimsSinceToken = Math.max(0, state.claimsSinceToken ?? 0);
state.backstopReady = !!state.backstopReady;
state.flags = {
  autoReturn: true,
  debugUnlockAll: false,
  performanceMode: false,
  ...(state.flags || {}),
};
state.serialCounters = state.serialCounters || {};

if (!state.streak) state.streak = { expiresAt: 0, steps: 0, count: 0 };
if (typeof (state.streak as any).count !== 'number') {
  const oldSteps = Math.max(0, state.streak.steps || 0);
  const seed =
    oldSteps >= 3
      ? STAGE3_CLAIMS
      : oldSteps === 2
      ? STAGE2_CLAIMS
      : oldSteps === 1
      ? STAGE1_CLAIMS
      : 0;
  state.streak.count = seed;
}

state.profile ||= {
  username: 'Player',
  avatarUrl: '',
  cosmetics: { owned: {}, equipped: {} },
};
(state.profile as any).cosmetics ||= { owned: {}, equipped: {} };
(state.profile.cosmetics as any).owned ||= {};
(state.profile.cosmetics as any).equipped ||= {};
(state as any).stats ||= {};
state.stats.lifetimeSpent = Math.max(0, state.stats.lifetimeSpent ?? 0);
state.stats.ticketsScratched = Math.max(0, state.stats.ticketsScratched ?? 0);
state.stats.tilesScratched = Math.max(0, state.stats.tilesScratched ?? 0);
state.stats.wins = Math.max(0, state.stats.wins ?? 0);
state.stats.losses = Math.max(0, state.stats.losses ?? 0);
state.stats.biggestWin = Math.max(0, state.stats.biggestWin ?? 0);
state.stats.fastestClearMs =
  typeof state.stats.fastestClearMs === 'number'
    ? Math.max(0, state.stats.fastestClearMs)
    : null;
state.stats.currentLossStreak = Math.max(0, state.stats.currentLossStreak ?? 0);
state.stats.longestLossStreak = Math.max(0, state.stats.longestLossStreak ?? 0);
state.stats.pityAvoids = Math.max(0, state.stats.pityAvoids ?? 0);
state.stats.tilePrizeCounts = state.stats.tilePrizeCounts || {};
state.badges = state.badges || {};

export function saveNow() {
  saveJSON(KEY, state);
}
export function clearState() {
  localStorage.removeItem(KEY);
}

// ----- Profile helpers -----
export function setUsername(name: string) {
  state.profile.username = (name || 'Player').slice(0, 24);
  saveNow();
}
export function setAvatarUrl(url: string) {
  state.profile.avatarUrl = (url || '').trim();
  saveNow();
}

// ----- Cosmetics helpers (NEW) -----
export function ownCosmetic(id: string): boolean {
  const key = String(id || '').trim();
  if (!key) return false;
  if (!state.profile.cosmetics.owned[key]) {
    state.profile.cosmetics.owned[key] = true as const;
    saveNow();
    try {
      window.dispatchEvent(
        new CustomEvent('cosmetic-owned', { detail: { id: key } })
      );
    } catch {}
  }
  return true;
}

export function isCosmeticOwned(id: string): boolean {
  const key = String(id || '').trim();
  return !!state.profile.cosmetics.owned[key];
}

export function equipCosmetic(
  slot: keyof EquippedCosmetics,
  id: string | null
): boolean {
  const s = String(slot || '').trim() as keyof EquippedCosmetics;
  if (!s) return false;
  if (id != null && !isCosmeticOwned(id)) return false;
  state.profile.cosmetics.equipped[s] = id ?? null;
  saveNow();
  try {
    window.dispatchEvent(
      new CustomEvent('cosmetic-equipped', {
        detail: { slot: s, id: id ?? null },
      })
    );
  } catch {}
  return true;
}

export function getEquippedCosmetics(): EquippedCosmetics {
  return { ...(state.profile.cosmetics.equipped || {}) };
}

// ----- Currency -----
export function addTokens(n: number) {
  const before = state.tokens ?? 0;
  state.tokens = Math.max(0, before + Math.max(0, n));
  saveNow();
  try {
    window.dispatchEvent(
      new CustomEvent('tokens-added', { detail: { n: state.tokens - before } })
    );
  } catch {}
}
export function spendTokens(n: number): boolean {
  if ((state.tokens ?? 0) < n) return false;
  state.tokens -= n;
  saveNow();
  try {
    window.dispatchEvent(new CustomEvent('tokens-spent', { detail: { n } }));
  } catch {}
  return true;
}

export function addVendorXp(xp: number) {
  const x = Math.max(0, Math.floor(xp));
  state.vendorXp = (state.vendorXp ?? 0) + x;
  const newLevel = levelForXP(state.vendorXp);
  const prev = state.vendorLevel;
  if (newLevel > prev) {
    state.vendorLevel = newLevel;
    resetStreak();
    try {
      window.dispatchEvent(
        new CustomEvent('vendor-level-up', {
          detail: { from: prev, to: newLevel },
        })
      );
    } catch {}
  }
  saveNow();
}
export function addLifetimeWinnings(amount: number) {
  state.lifetimeWinnings = Math.max(
    0,
    (state.lifetimeWinnings ?? 0) + Math.max(0, amount)
  );
  saveNow();
}

// lifetime spent tracker (used when buying)
export function addLifetimeSpent(amount: number) {
  const a = Math.max(0, Math.floor(amount || 0));
  state.stats.lifetimeSpent = Math.max(0, (state.stats.lifetimeSpent ?? 0) + a);
  saveNow();
}

// ----- Unlocks (with debug override) -----
export function isTierUnlocked(tierId: string): boolean {
  if (state.flags?.debugUnlockAll) return true;
  return !!state.unlocks?.[tierId] || false;
}
export function getUnlockStatus(tierId: string) {
  const tier = getTierById(tierId);
  if (!tier) return null;

  const needLvl = tier.unlock.vendorLevel || 1;
  const needTok = tier.unlock.tokens || 0;
  const needWin = tier.unlock.lifetimeWinnings || 0;

  if (state.flags?.debugUnlockAll) {
    return {
      needLvl,
      needTok,
      needWin,
      hasLvl: true,
      hasTok: true,
      hasWin: true,
      ok: true,
    };
  }

  const hasLvl = (state.vendorLevel ?? 1) >= needLvl;
  const hasTok = (state.tokens ?? 0) >= needTok;
  const hasWin = (state.lifetimeWinnings ?? 0) >= needWin;

  return {
    needLvl,
    needTok,
    needWin,
    hasLvl,
    hasTok,
    hasWin,
    ok: hasLvl && hasTok && hasWin,
  };
}

export function unlockTier(tierId: string): boolean {
  const s = getUnlockStatus(tierId);
  if (!s?.ok) return false;
  if (s.needTok > 0 && !state.flags?.debugUnlockAll && !spendTokens(s.needTok))
    return false;
  state.unlocks[tierId] = true;
  saveNow();
  try {
    window.dispatchEvent(
      new CustomEvent('tier-unlocked', { detail: { tierId } })
    );
  } catch {}
  return true;
}

// ----- Pity / Backstop -----
export function isBackstopReady(): boolean {
  return !!state.backstopReady;
}
export function consumeBackstopFlag(): boolean {
  if (!state.backstopReady) return false;
  state.backstopReady = false;
  saveNow();
  return true;
}
export function getBackstopFloorPct(): number {
  return BACKSTOP_FLOOR_PCT;
}

// ----- Streak core -----
function nowMs(): number {
  return Date.now();
}
function resetStreak() {
  state.streak = { expiresAt: 0, steps: 0, count: 0 };
}
function decayStreakIfExpired() {
  if (!state.streak) {
    resetStreak();
    return;
  }
  if (nowMs() > (state.streak.expiresAt || 0)) resetStreak();
}
function stageForCount(count: number): number {
  if (count >= STAGE3_CLAIMS) return 3;
  if (count >= STAGE2_CLAIMS) return 2;
  if (count >= STAGE1_CLAIMS) return 1;
  return 0;
}
export function bumpStreak() {
  decayStreakIfExpired();
  const c = (state.streak.count || 0) + 1;
  state.streak.count = c;
  state.streak.steps = stageForCount(c);
  state.streak.expiresAt = nowMs() + STREAK_WINDOW_MS;
  saveNow();
}
export function getStreakMetrics() {
  decayStreakIfExpired();
  const expiresAt = state.streak.expiresAt || 0;
  const msRemaining = Math.max(0, expiresAt - nowMs());
  const ratio = Math.max(0, Math.min(1, msRemaining / STREAK_WINDOW_MS));

  const stage = Math.max(0, Math.min(3, state.streak.steps || 0));
  const baseWidth =
    stage === 3 ? 1.0 : stage === 2 ? 0.8 : stage === 1 ? 0.4 : 0.0;
  const fillWidth = baseWidth * ratio;

  let displayPercent = 0;
  if (stage === 3) {
    if (fillWidth >= 0.8) displayPercent = 5;
    else if (fillWidth >= 0.4) displayPercent = 4;
    else if (fillWidth > 0) displayPercent = 2;
  } else if (stage === 2) {
    if (fillWidth >= 0.32) displayPercent = 4;
    else if (fillWidth > 0) displayPercent = 2;
  } else if (stage === 1) {
    if (fillWidth > 0) displayPercent = 2;
  }

  const factor = 1 + displayPercent / 100;
  return {
    steps: stage,
    count: state.streak.count || 0,
    expiresAt,
    msRemaining,
    ratio,
    baseWidth,
    fillWidth,
    displayPercent,
    factor,
  };
}
export function getStreakPercent(): number {
  return getStreakMetrics().displayPercent;
}
export function getStreakFactor(): number {
  return getStreakMetrics().factor;
}

// ----- Badges (events only; UI handled elsewhere) -----
export function hasBadge(id: string) {
  return !!state.badges?.[id];
}
export function awardBadge(id: string) {
  if (hasBadge(id)) return false;
  state.badges[id] = Date.now();
  saveNow();
  const suppressed = (window as any).__BADGES_SUPPRESS__ === true;
  if (!suppressed) {
    try {
      window.dispatchEvent(new CustomEvent('badge-earned', { detail: { id } }));
    } catch {}
  }
  return true;
}

// ----- Tiles scratched helper -----
export function incTilesScratched(n = 1) {
  const add = Math.max(0, Math.floor(n));
  state.stats.tilesScratched = Math.max(
    0,
    (state.stats.tilesScratched ?? 0) + add
  );
  saveNow();
  try {
    window.dispatchEvent(new Event('badges-scan-now'));
  } catch {}
}

// ----- Claim side-effects -----
export function onTicketClaimed(
  tierId: string,
  payout: number,
  meta?: { clearMs?: number; tilePrizes?: number[]; priceOverride?: number }
) {
  const tier = getTierById(tierId);
  const price = meta?.priceOverride ?? tier?.price ?? 0;

  addLifetimeWinnings(payout);

  if (!state.firstClaims[tierId]) {
    state.firstClaims[tierId] = true;
    addTokens(1);
  }

  if (state.daily.day !== today()) {
    state.daily = { day: today(), claimed: 0, awarded: false };
  }
  state.daily.claimed += 1;
  if (!state.daily.awarded && state.daily.claimed >= 10) {
    state.daily.awarded = true;
    addTokens(1);
  }

  state.claimsSinceToken = (state.claimsSinceToken ?? 0) + 1;
  if (state.claimsSinceToken >= CLAIMS_PER_TOKEN) {
    const awards = Math.floor(state.claimsSinceToken / CLAIMS_PER_TOKEN);
    state.claimsSinceToken -= awards * CLAIMS_PER_TOKEN;
    addTokens(awards);
  }

  state.stats.ticketsScratched = (state.stats.ticketsScratched ?? 0) + 1;
  state.stats.biggestWin = Math.max(state.stats.biggestWin ?? 0, payout);

  if (typeof meta?.clearMs === 'number' && meta.clearMs >= 0) {
    const best = state.stats.fastestClearMs;
    state.stats.fastestClearMs =
      best == null ? meta.clearMs : Math.min(best, meta.clearMs);
  }

  const prevPity = Math.max(0, state.pityCount ?? 0);
  const isWinTicket = payout >= price;
  if (isWinTicket) {
    state.stats.wins = (state.stats.wins ?? 0) + 1;
    if (prevPity > 0)
      state.stats.pityAvoids = (state.stats.pityAvoids ?? 0) + 1;
    state.stats.currentLossStreak = 0;
  } else {
    state.stats.losses = (state.stats.losses ?? 0) + 1;
    state.stats.currentLossStreak = (state.stats.currentLossStreak ?? 0) + 1;
    state.stats.longestLossStreak = Math.max(
      state.stats.longestLossStreak ?? 0,
      state.stats.currentLossStreak
    );
  }

  if (meta?.tilePrizes?.length) {
    for (const p of meta.tilePrizes) {
      const k = String(Math.max(0, Math.floor(p)));
      state.stats.tilePrizeCounts[k] =
        (state.stats.tilePrizeCounts[k] ?? 0) + 1;
    }
  }

  const netLoss = payout < price;
  if (netLoss) {
    state.pityCount = (state.pityCount ?? 0) + 1;
    if (state.pityCount >= PITY_THRESHOLD) {
      state.pityCount = 0;
      state.backstopReady = true;
    }
  } else {
    state.pityCount = 0;
  }

  bumpStreak();

  saveNow();

  try {
    window.dispatchEvent(
      new CustomEvent('ticket-claimed', {
        detail: { isWin: isWinTicket, tierId },
      })
    );
  } catch {}
  try {
    window.dispatchEvent(new Event('badges-scan-now'));
  } catch {}
}

// ----- Settings utilities -----
export function replaceState(next: Partial<GameState>) {
  Object.assign(
    state,
    {
      money: STARTING_MONEY,
      tokens: 0,
      vendorXp: 0,
      vendorLevel: 1,
      lifetimeWinnings: 0,
      claimsSinceToken: 0,
      unlocks: {},
      upgrades: {},
      firstClaims: {},
      daily: {
        day: new Date().toISOString().slice(0, 10),
        claimed: 0,
        awarded: false,
      },
      pityCount: 0,
      backstopReady: false,
      streak: { expiresAt: 0, steps: 0, count: 0 },
      serialCounters: {},
      inventory: [],
      flags: {
        autoReturn: true,
        debugUnlockAll: false,
        performanceMode: false,
      },
      profile: {
        username: 'Player',
        avatarUrl: '',
        cosmetics: { owned: {}, equipped: {} },
      },
      stats: {
        lifetimeSpent: 0,
        ticketsScratched: 0,
        tilesScratched: 0,
        wins: 0,
        losses: 0,
        biggestWin: 0,
        fastestClearMs: null,
        currentLossStreak: 0,
        longestLossStreak: 0,
        pityAvoids: 0,
        tilePrizeCounts: {},
      },
      badges: {},
    } as GameState,
    state,
    next
  );
  saveNow();
}
export function resetAndSave() {
  replaceState({
    money: STARTING_MONEY,
    tokens: 0,
    vendorXp: 0,
    vendorLevel: 1,
    lifetimeWinnings: 0,
    unlocks: {},
    upgrades: {},
    firstClaims: {},
    daily: {
      day: new Date().toISOString().slice(0, 10),
      claimed: 0,
      awarded: false,
    },
    pityCount: 0,
    backstopReady: false,
    streak: { expiresAt: 0, steps: 0, count: 0 },
    serialCounters: {},
    inventory: [],
    profile: {
      username: 'Player',
      avatarUrl: '',
      cosmetics: { owned: {}, equipped: {} },
    },
    stats: {
      lifetimeSpent: 0,
      ticketsScratched: 0,
      tilesScratched: 0,
      wins: 0,
      losses: 0,
      biggestWin: 0,
      fastestClearMs: null,
      currentLossStreak: 0,
      longestLossStreak: 0,
      pityAvoids: 0,
      tilePrizeCounts: {},
    },
    badges: {},
  });
}

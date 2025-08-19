import raw from '../data/Upgrades.json?raw';
import { state, saveNow } from './state.js';

/** A step function value: either a fixed level list or linear per-level. */
interface Step { levels?: number[]; perLevel?: number; cap?: number }

/** Effects contributed by an upgrade (all additive across upgrades). */
interface EffectSpec {
  ticketDiscountPct?: Step; // % off vendor total
  prizeMultiplierPct?: Step; // % extra payout
  scratchParallelMax?: Step; // absolute: 2 or 3 (defaults to 1 when absent)
}

export interface UpgradeDef {
  id: string;
  name: string;
  type: 'ux' | 'econ';
  levelCap: number;
  costPerLevel?: number[];
  baseCost?: number;
  costGrowth?: number;
  image?: string;
  desc?: string;
  effect?: EffectSpec;
  /** Gates: e.g. { "scratch_radius": 3 } */
  requires?: Record<string, number>;
}

const cfg = JSON.parse(raw) as { upgrades: UpgradeDef[] };

export function getDefs(): UpgradeDef[] {
  return cfg.upgrades.slice();
}
export function getDef(id: string): UpgradeDef | undefined {
  return cfg.upgrades.find((u) => u.id === id);
}
export function getLevel(id: string): number {
  return Math.max(0, state.upgrades?.[id] ?? 0);
}
export function getScratchParallelCount(): number {
  const lvl = getLevel('scratch_radius_pro'); // 0..2
  if (lvl >= 2) return 3;
  if (lvl >= 1) return 2;
  return 1;
}

/** Evaluate a Step at a given level. */
function evalStep(step: Step | undefined, level: number): number {
  if (!step || level <= 0) return 0;
  const c = step.cap ?? Number.POSITIVE_INFINITY;
  if (step.levels?.length) {
    const idx = Math.min(level, step.levels.length) - 1;
    const v = idx >= 0 ? step.levels[idx] : 0;
    return Math.min(v, c);
  }
  if (typeof step.perLevel === 'number') {
    return Math.min(step.perLevel * level, c);
  }
  return 0;
}

export function nextCost(id: string): number | null {
  const def = getDef(id);
  if (!def) return null;
  const lvl = getLevel(id);
  if (lvl >= def.levelCap) return null;

  if (def.costPerLevel?.[lvl] != null) {
    return def.costPerLevel[lvl];
  }
  const base = def.baseCost ?? 1000;
  const growth = def.costGrowth ?? 2;
  return Math.floor(base * Math.pow(growth, lvl));
}

function meetsRequirements(def: UpgradeDef): boolean {
  if (!def.requires) return true;
  for (const [id, need] of Object.entries(def.requires)) {
    if (getLevel(id) < need) return false;
  }
  return true;
}

export function canBuy(id: string): boolean {
  const def = getDef(id);
  if (!def) return false;
  const c = nextCost(id);
  return c !== null && state.money >= c && meetsRequirements(def);
}

export function buyUpgrade(id: string): boolean {
  const c = nextCost(id);
  const def = getDef(id);
  if (!def || c === null || state.money < c || !meetsRequirements(def))
    return false;
  state.money -= c;
  state.upgrades[id] = getLevel(id) + 1;
  saveNow();
  return true;
}

/** Aggregate all effects across purchased levels. */
export function getEffects() {
  const res = {
    ticketDiscountPct: 0,
    prizeMultiplierPct: 0,
    scratchParallelMax: 0,
  };

  for (const def of getDefs()) {
    const lvl = getLevel(def.id);
    if (lvl <= 0 || !def.effect) continue;

    res.ticketDiscountPct += evalStep(def.effect.ticketDiscountPct, lvl);
    res.prizeMultiplierPct += evalStep(def.effect.prizeMultiplierPct, lvl);

    // scratchParallelMax is an absolute (use the highest)
    const par = evalStep(def.effect.scratchParallelMax, lvl);
    if (par > res.scratchParallelMax) res.scratchParallelMax = par;
  }
  return res;
}

/** ---- helpers the rest of the game uses ---- */

export function getDiscountedTotal(unitPrice: number, qty: number): number {
  const { ticketDiscountPct } = getEffects();
  const total = unitPrice * qty * (1 - ticketDiscountPct / 100);
  return Math.max(0, Math.floor(total));
}

export function getPrizeMultiplier(): number {
  const { prizeMultiplierPct } = getEffects();
  return 1 + prizeMultiplierPct / 100;
}

/** Existing scratch radius behavior (unchanged). */
export type ScratchMode = 'single' | 'cross' | 'square3' | 'all';
export function getScratchMode(): ScratchMode {
  const lvl = getLevel('scratch_radius');
  if (lvl >= 3) return 'all';
  if (lvl === 2) return 'square3';
  if (lvl === 1) return 'cross';
  return 'single';
}

/** NEW: parallel scratch capacity (1 by default). */
export function getScratchParallelMax(): number {
  const n = getEffects().scratchParallelMax;
  return Math.max(1, Math.floor(n || 0));
}

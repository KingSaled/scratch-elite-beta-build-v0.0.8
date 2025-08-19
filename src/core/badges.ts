import { state } from '../core/state.js';
import { getTiers } from '../data/content.js';

// ---------- Types ----------
export interface BadgeDef {
  id: string;
  name: string;
  desc: string; // hover tooltip
  group: 'sets' | 'milestones';
}

export interface BadgeStatus {
  id: string;
  earned: boolean;
}

// ---------- Helpers ----------
function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
function safeName(s: string) {
  return s.toLowerCase().replace(/\W+/g, '_');
}

/** Minimal set list used for "own any from the set" badges */
function getAllSets(): { id: string; name: string }[] {
  const tiers = getTiers() as { id: string; set?: string }[];
  const names = uniq(
    tiers
      .map((t) => (t as any).set || '')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return names.map((name) => ({
    id: `set_${safeName(name)}`,
    name,
  }));
}

/** Full index used to evaluate "complete the set" */
function getSetsMeta(): {
  name: string;
  safe: string;
  tierIds: string[];
}[] {
  const tiers = getTiers() as { id: string; set?: string }[];
  const by: Record<string, { name: string; safe: string; tierIds: string[] }> =
    {};
  for (const t of tiers) {
    const name = (t.set || '').trim();
    if (!name) continue;
    const safe = safeName(name);
    if (!by[safe]) by[safe] = { name, safe, tierIds: [] };
    by[safe].tierIds.push(t.id);
  }
  return Object.values(by);
}

function getInventory() {
  return (state.inventory || []) as {
    tierId: string;
    state: 'sealed' | 'scratched' | 'claimed';
    ticket?: { payout?: number };
  }[];
}

function getTierById(id: string) {
  return (getTiers() as any[]).find((t) => t.id === id);
}

function countClaimed(): number {
  return getInventory().filter((i) => i.state === 'claimed').length;
}
function tilesScratched(): number {
  return Number((state as any).stats?.tilesScratched ?? 0);
}
function bestStreak(): number {
  const s = (state as any).streak || {};
  return Number(s.best ?? s.bestDays ?? 0);
}
function bestPayoutFromHistory(): number {
  let max = 0;
  for (const it of getInventory()) {
    const v = Number((it.ticket as any)?.payout ?? 0);
    if (v > max) max = v;
  }
  const alt = Number((state as any).stats?.bestPayout ?? 0);
  return Math.max(max, alt);
}

// ---------- Definitions ----------
export function getBadgeDefs(): BadgeDef[] {
  const setBadges: BadgeDef[] = getAllSets().map((s) => ({
    id: s.id,
    name: `${s.name} Set`,
    desc: `Unlock (own) any ticket from the ${s.name} set.`,
    group: 'sets',
  }));

  // Per-set "Complete" badges (own at least one of EVERY tier in that set)
  const completeBadges: BadgeDef[] = getSetsMeta().map((m) => ({
    id: `set_complete_${m.safe}`,
    name: `${m.name} — Complete`,
    desc: `Own at least one of every tier in the ${m.name} set.`,
    group: 'sets',
  }));

  const milestoneBadges: BadgeDef[] = [
    {
      id: 'first_scratch',
      name: 'First Scratch',
      desc: 'Scratch your very first tile.',
      group: 'milestones',
    },
    {
      id: 'scratch_100',
      name: 'Scratch 100',
      desc: 'Scratch 100 tiles total.',
      group: 'milestones',
    },
    {
      id: 'scratch_1000',
      name: 'Scratch 1000',
      desc: 'Scratch 1,000 tiles total.',
      group: 'milestones',
    },

    {
      id: 'first_claim',
      name: 'First Claim',
      desc: 'Claim your first winning ticket.',
      group: 'milestones',
    },
    {
      id: 'claim_10',
      name: 'On a Roll',
      desc: 'Claim 10 tickets.',
      group: 'milestones',
    },
    {
      id: 'claim_100',
      name: 'Hundred Club',
      desc: 'Claim 100 tickets.',
      group: 'milestones',
    },

    {
      id: 'streak_5',
      name: 'Hot Streak',
      desc: 'Reach a 5-day streak.',
      group: 'milestones',
    },
    {
      id: 'streak_10',
      name: 'Blazing',
      desc: 'Reach a 10-day streak.',
      group: 'milestones',
    },

    {
      id: 'bigwin_1k',
      name: 'Big Win',
      desc: 'Win at least $1,000 on a ticket.',
      group: 'milestones',
    },
    {
      id: 'bigwin_10k',
      name: 'Whale',
      desc: 'Win at least $10,000 on a ticket.',
      group: 'milestones',
    },
    {
      id: 'bigwin_100k',
      name: 'Jackpotter',
      desc: 'Win at least $100,000 on a ticket.',
      group: 'milestones',
    },
  ];

  return [...milestoneBadges, ...setBadges, ...completeBadges];
}

// ---------- Evaluation ----------
export function getEarnedBadges(): Record<string, boolean> {
  const earned: Record<string, boolean> = {};

  // manual unlocks in save:
  const stored = (state.badges || {});
  for (const [k, v] of Object.entries(stored)) {
    if (v > 0) earned[k] = true;
  }

  // tiles scratched
  const scratched = tilesScratched();
  if (scratched >= 1) earned.first_scratch = true;
  if (scratched >= 100) earned.scratch_100 = true;
  if (scratched >= 1000) earned.scratch_1000 = true;

  // claims
  const claimed = countClaimed();
  if (claimed >= 1) earned.first_claim = true;
  if (claimed >= 10) earned.claim_10 = true;
  if (claimed >= 100) earned.claim_100 = true;

  // streaks
  const s = bestStreak();
  if (s >= 5) earned.streak_5 = true;
  if (s >= 10) earned.streak_10 = true;

  // big wins
  const best = bestPayoutFromHistory();
  if (best >= 1000) earned.bigwin_1k = true;
  if (best >= 10000) earned.bigwin_10k = true;
  if (best >= 100000) earned.bigwin_100k = true;

  // sets – own any ticket from that set
  const inv = getInventory();
  const haveTier = new Set(inv.map((i) => i.tierId));

  const setsOwned = new Set<string>();
  for (const it of inv) {
    const tier = getTierById(it.tierId);
    const setName = (tier?.set || '').trim();
    if (setName) setsOwned.add(safeName(setName));
  }
  for (const sname of setsOwned) {
    earned[`set_${sname}`] = true;
  }

  // per-set "Complete" — own at least one of EVERY tier in the set
  for (const meta of getSetsMeta()) {
    if (meta.tierIds.length && meta.tierIds.every((tid) => haveTier.has(tid))) {
      earned[`set_complete_${meta.safe}`] = true;
    }
  }

  return earned;
}

export function getEarnedCount(): number {
  return Object.values(getEarnedBadges()).filter(Boolean).length;
}

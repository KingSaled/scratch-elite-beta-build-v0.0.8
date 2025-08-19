import tiersRaw from './TicketTiers.json?raw';
import tablesRaw from './PrizeTables.json?raw';
const tiersJSON = JSON.parse(tiersRaw);
const tablesJSON = JSON.parse(tablesRaw);

import { rng } from '../core/rng.js';

export interface Tier {
  id: string;
  name: string;
  set: string;
  price: number;
  evTarget: number;
  unlock: { vendorLevel: number; tokens: number; lifetimeWinnings: number };
  mechanics: {
    grid: [number, number];
    winningNumbers: number;
    hasBonusBox: boolean;
    multiplierChances: number[];
  };
  visual: { bgKey: string; foil: 'none' | 'gold' | 'holo'; holo: boolean };
}
export interface PrizeWeight { prize: number; weight: number }

const tierList: Tier[] = (tiersJSON).tiers as Tier[];
const prizeTables: Record<string, PrizeWeight[]> = (tablesJSON).tables;

const normalized: Record<
  string,
  { prize: number; prob: number; cum: number }[]
> = {};
for (const [tierId, rows] of Object.entries(prizeTables)) {
  const total = rows.reduce((a, r) => a + r.weight, 0) || 1;
  let cum = 0;
  normalized[tierId] = rows.map((r) => {
    const prob = r.weight / total;
    cum += prob;
    return { prize: r.prize, prob, cum };
  });
  if (normalized[tierId].length)
    normalized[tierId][normalized[tierId].length - 1].cum = 1;
}

export function getTiers(): Tier[] {
  return tierList;
}
export function getTierById(id: string): Tier | undefined {
  return tierList.find((t) => t.id === id);
}

export function computeEV(tierId: string): number {
  const t = getTierById(tierId);
  if (!t) return 0;
  const rows = prizeTables[tierId] || [];
  const total = rows.reduce((a, r) => a + r.weight, 0) || 1;
  const expected = rows.reduce((a, r) => a + r.prize * (r.weight / total), 0);
  return expected / t.price;
}

export function samplePrizeWith(tierId: string, rnd: () => number): number {
  const list = normalized[tierId];
  if (!list?.length) return 0;
  const r = rnd(); // 0..1
  for (const row of list) if (r <= row.cum) return row.prize;
  return list[list.length - 1].prize;
}
export function samplePrize(tierId: string): number {
  return samplePrizeWith(tierId, rng);
}

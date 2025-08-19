import { getTierById, samplePrizeWith } from '../data/content.js';
import { makeRng } from '../core/rng.js';

export interface GenTile {
  num: number;
  prize: number;
  revealed: boolean;
  win: boolean;
}
export interface GenTicket {
  winning: number[];
  tiles: GenTile[];
  totalPrize: number;
}

export function generateTicket(tierId: string, serialId: string): GenTicket {
  const tier = getTierById(tierId);
  if (!tier) return { winning: [], tiles: [], totalPrize: 0 };

  const [cols, rows] = tier.mechanics.grid; // typically [4,3]
  const totalCells = cols * rows;
  const rnd = makeRng(`${tierId}:${serialId}:ticket`);

  // winning numbers (distinct) 1..99
  const winCount = tier.mechanics.winningNumbers || 4;
  const winningSet = new Set<number>();
  while (winningSet.size < winCount) {
    const n = 1 + Math.floor(rnd() * 99);
    winningSet.add(n);
  }
  const winning = Array.from(winningSet).sort((a, b) => a - b);

  // tiles
  const tiles: GenTile[] = [];
  for (let i = 0; i < totalCells; i++) {
    const num = 1 + Math.floor(rnd() * 99);
    const prize = samplePrizeWith(tierId, rnd); // deterministic per serial
    const win = winningSet.has(num);
    tiles.push({ num, prize, revealed: false, win });
  }

  const totalPrize = tiles.reduce((sum, t) => sum + (t.win ? t.prize : 0), 0);
  return { winning, tiles, totalPrize };
}

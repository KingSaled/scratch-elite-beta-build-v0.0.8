import raw from '../data/Progression.json?raw';
const prog = JSON.parse(raw) as { levels: { level: number; xp: number }[] };

const thresholds = prog.levels
  .sort((a, b) => a.level - b.level)
  .map((r) => ({ level: r.level, xp: r.xp }));

export function levelForXP(xp: number): number {
  let lvl = 1;
  for (const t of thresholds) if (xp >= t.xp) lvl = t.level;
  return lvl;
}
export function nextLevelXP(level: number): number | null {
  const idx = thresholds.findIndex((t) => t.level === level + 1);
  return idx >= 0 ? thresholds[idx].xp : null;
}

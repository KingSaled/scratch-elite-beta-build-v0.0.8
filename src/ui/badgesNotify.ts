// src/ui/badgesNotify.ts
import { getBadgeDefs, getEarnedBadges } from '../core/badges.js';
import { toast } from './alerts.js';

const defs = getBadgeDefs();
const nameById = new Map(defs.map((d) => [d.id, d.name]));

const seen = new Set<string>();

function baseline() {
  const earned = getEarnedBadges();
  Object.keys(earned).forEach((id) => {
    if (earned[id]) seen.add(id);
  });
}

function scan() {
  const earned = getEarnedBadges();
  for (const [id, ok] of Object.entries(earned)) {
    if (!ok) continue;
    if (!seen.has(id)) {
      seen.add(id);
      const nice = nameById.get(id) || id;
      toast(`Badge earned: ${nice}`, 'success');
      try {
        window.dispatchEvent(
          new CustomEvent('badge-earned', { detail: { id, name: nice } })
        );
      } catch {}
    }
  }
}

baseline();

// Respond immediately when game code hints there might be updates
window.addEventListener('badges-baseline-now', baseline);
window.addEventListener('badges-scan-now', scan);

// Safety: periodic sweep
setInterval(scan, 1200);

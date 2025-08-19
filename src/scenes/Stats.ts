import { Container } from 'pixi.js';
import { state } from '../core/state.js';
import { getBadgeDefs, getEarnedBadges } from '../core/badges.js';

function mostCommonPrize(counts: Record<string, number>): string {
  let bestKey = '';
  let best = -1;
  for (const [k, v] of Object.entries(counts || {})) {
    if (v > best) {
      best = v;
      bestKey = k;
    }
  }
  return bestKey || '—';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function card(title: string, value: string): string {
  return (
    '<div class="stat-card">' +
    '<div class="t">' +
    escapeHtml(title) +
    '</div>' +
    '<div class="v">' +
    escapeHtml(value) +
    '</div>' +
    '</div>'
  );
}

export class StatsScene extends Container {
  private panel = document.getElementById(
    'statsPanel'
  ) as HTMLDivElement | null;
  private unsub: (() => void)[] = [];

  onEnter() {
    if (!this.panel) return;
    this.panel.classList.add('show');
    this.render();

    const onClaim = () => this.render();
    const onBadgeScan = () => this.render();

    window.addEventListener('ticket-claimed', onClaim as EventListener);
    window.addEventListener('badges-scan-now', onBadgeScan as EventListener);

    this.unsub.push(() =>
      window.removeEventListener('ticket-claimed', onClaim as EventListener)
    );
    this.unsub.push(() =>
      window.removeEventListener(
        'badges-scan-now',
        onBadgeScan as EventListener
      )
    );
  }

  onExit() {
    if (!this.panel) return;
    this.panel.classList.remove('show');
    for (const fn of this.unsub) fn();
    this.unsub = [];
  }

  layout() {}

  private render() {
    if (!this.panel) return;

    const s = state.stats || ({} as any);

    const lifetimeEarnings = Math.max(0, Number(state.lifetimeWinnings ?? 0));
    const lifetimeSpent = Math.max(0, Number(s.lifetimeSpent ?? 0));
    const net = lifetimeEarnings - lifetimeSpent;

    const biggestWinStr = '$' + Number(s.biggestWin ?? 0).toLocaleString();
    const fastestStr =
      s.fastestClearMs == null
        ? '—'
        : (s.fastestClearMs / 1000).toFixed(2) + 's';
    const winsLossesStr = String(s.wins ?? 0) + ' / ' + String(s.losses ?? 0);
    const lifeEarnStr = '$' + lifetimeEarnings.toLocaleString();
    const netStr = '$' + net.toLocaleString();

    const common = mostCommonPrize(s.tilePrizeCounts || {});
    const commonStr =
      common === '—' ? '—' : '$' + Number(common).toLocaleString();

    // Build cards with plain strings (no nested template literals)
    const cards: string[] = [];
    cards.push(
      card('Tickets Scratched', (s.ticketsScratched ?? 0).toLocaleString())
    );
    cards.push(
      card('Tiles Scratched', (s.tilesScratched ?? 0).toLocaleString())
    );
    cards.push(card('Biggest Win', biggestWinStr));
    cards.push(card('Fastest Clear', fastestStr));
    cards.push(card('Wins / Losses', winsLossesStr));
    cards.push(card('Lifetime Earnings', lifeEarnStr)); // <— replaces “Longest Loss Streak”
    cards.push(card('Net Profit', netStr));
    cards.push(card('Most Common Prize', commonStr));

    // Write main stats + badges shell
    this.panel.innerHTML =
      '<div class="stats-grid">' +
      cards.join('') +
      '</div>' +
      '<h3 class="stats-sub">Badges</h3>' +
      '<div class="badges-section">' +
      '  <div class="badges-scroller" role="region" aria-label="Badges">' +
      '    <div class="badges-grid" id="badgesGrid"></div>' +
      '  </div>' +
      '</div>';

    // Populate badges
    const grid = this.panel.querySelector('#badgesGrid')!;
    if (!grid) return;

    const defs = getBadgeDefs().slice();
    const bucket = (id: string) =>
      id.startsWith('set_complete_') ? 2 : id.startsWith('set_') ? 1 : 0;
    defs.sort(
      (a, b) => bucket(a.id) - bucket(b.id) || a.name.localeCompare(b.name)
    );

    const earned = getEarnedBadges();
    for (const def of defs) {
      grid.appendChild(makeBadge(def.id, def.name, def.desc, !!earned[def.id]));
    }
  }
}

function makeBadge(
  _id: string,
  label: string,
  desc: string,
  isEarned: boolean
) {
  const el = document.createElement('div');
  el.className = 'badge ' + (isEarned ? 'earned' : 'locked');

  const pill = document.createElement('div');
  pill.className = 'badge-pill';

  const name = document.createElement('div');
  name.className = 'badge-name';
  name.textContent = label;

  const tip = document.createElement('div');
  tip.className = 'badge-tip';
  tip.textContent = desc || '—';

  el.append(pill, name, tip);
  return el;
}

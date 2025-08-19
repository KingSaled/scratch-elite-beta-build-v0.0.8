// src/ui/streakHud.ts
import { getStreakMetrics } from '../core/state.js';

let booted = false;

let host: HTMLDivElement | null = null;
let titleEl: HTMLDivElement | null = null;
let pctEl: HTMLDivElement | null = null;
let fillEl: HTMLDivElement | null = null;

function ensureHost(): HTMLDivElement | null {
  // Prefer an existing mount in the header
  host = document.getElementById('streakHud') as HTMLDivElement | null;
  if (host) return host;

  // If it doesn't exist, create it inside the topbar (right side container if present)
  const topbar = document.querySelector('.topbar');
  if (!topbar) return null;

  host = document.createElement('div');
  host.id = 'streakHud';
  topbar.appendChild(host);
  return host;
}

function mount() {
  const h = ensureHost();
  if (!h) return;

  h.innerHTML = `
    <div class="streak-wrap">
      <div class="streak-title" id="streakTitle">Streak Bonus +0%</div>
      <div class="bar">
        <div class="marks">
          <div class="mark" style="left:40%"></div>
          <div class="mark" style="left:80%"></div>
          <div class="mark" style="left:100%"></div>
        </div>
        <div class="fill" id="streakFill"></div>
        <div class="pct" id="streakPct">+0%</div>
      </div>
    </div>
  `;

  titleEl = h.querySelector('#streakTitle');
  pctEl = h.querySelector('#streakPct');
  fillEl = h.querySelector('#streakFill');
}

function update() {
  if (!host || !titleEl || !pctEl || !fillEl) return;

  const m = getStreakMetrics() as any;

  // Stepped bonus: 0 / +2 / +4 / +5
  const pct = Number(m.displayPercent || 0);

  // Title stays "Streak Bonus +X%" at all times, centered above the bar
  titleEl.textContent = `Streak Bonus +${pct}%`;

  // Overlay label on the bar (right side)
  pctEl.textContent = `+${pct}%`;

  // Fill width: prefer provided fillWidth; else baseWidth*ratio
  const width =
    typeof m.fillWidth === 'number'
      ? Math.max(0, Math.min(1, m.fillWidth))
      : Math.max(
          0,
          Math.min(1, (Number(m.baseWidth) || 0) * (Number(m.ratio) || 0))
        );

  fillEl.style.width = `${Math.round(width * 100)}%`;
  fillEl.style.opacity = width > 0 ? '1' : '0.4';
}

/** Public init – safe to call once at boot. */
export function initStreakHUD() {
  if (booted) return;
  booted = true;

  mount();

  // If header isn't ready yet, retry briefly until elements exist
  if (!titleEl || !pctEl || !fillEl) {
    const retry = setInterval(() => {
      mount();
      if (titleEl && pctEl && fillEl) clearInterval(retry);
    }, 150);
  }

  update();
  // Smooth, lightweight periodic updates
  setInterval(update, 200);
}

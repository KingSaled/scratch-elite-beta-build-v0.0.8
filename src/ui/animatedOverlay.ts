/* Premium overlay v3: rainbow holo (CSS), sweep, sparkles, edge glow + hole punch */
import { state } from '../core/state.js';
import { getTierById } from '../data/content.js';
import { getCurrentItem } from '../core/session.js';

// Keep in sync with ScratchView
const DESIGN_W = 600;
const DESIGN_H = 850;
const EXTRA_TOP = 12;
const EXTRA_BOTTOM = 18;
const MAX_WIDTH_FRAC = 0.95;
const MAX_HEIGHT_FRAC = 0.95;
const USER_SCALE = 1.0;
const CARD_RADIUS = 20;

interface Visual {
  holoOverlay?: string;
  foilOverlay?: string;
  overlayAlpha?: number;
  overlayParallax?: number;

  // CSS rainbow controls
  overlayRainbow?: boolean;
  overlayRainbowAlpha?: number; // 0..1
  overlayRainbowSpeed?: number; // seconds

  // Sweep
  overlaySweep?: boolean;
  overlaySweepWidth?: number; // px at design scale
  overlaySweepSpeed?: number; // seconds across
  overlaySweepInterval?: number; // seconds pause
  overlaySweepAlpha?: number; // 0..1
  overlaySweepTilt?: number; // deg

  // Edge glow / sparkles
  overlayEdgeGlow?: boolean;
  overlayEdgeGlowStrength?: number; // 0..1
  overlaySparkles?: boolean | number;
  overlaySparkleCount?: number;
  overlaySparkleSize?: number;
  overlaySparkleSpeedMin?: number;
  overlaySparkleSpeedMax?: number;

  accentHex?: string;
}

type Tier = { id: string; visual?: Visual } | null;

function injectCSS() {
  if (document.getElementById('fxOverlayCSS')) return;
  const st = document.createElement('style');
  st.id = 'fxOverlayCSS';
  st.textContent = `
  #fxOverlay{
    position:fixed; left:0; top:0; width:0; height:0;
    pointer-events:none; /* click-through */
    z-index:9999;
    opacity:0; transition:opacity .15s ease-out;
    border-radius:${CARD_RADIUS}px;
    overflow:hidden;
  }
  #fxOverlay .layer{
    position:absolute; inset:0;
    background-size:cover;
    background-position:center;
    will-change:transform, filter, opacity;
  }
  #fxOverlay .pattern{
    background-image:var(--overlay-image, none);
    opacity:var(--overlay-alpha, .28);
  }
  #fxOverlay .rainbow{
    opacity:var(--rainbow-alpha, .32);
    background:
      radial-gradient(120% 100% at 0% 0%, rgba(255,255,255,.25), transparent 60%),
      radial-gradient(120% 100% at 100% 100%, rgba(255,255,255,.18), transparent 60%),
      conic-gradient(from 0deg,
        #ff0040, #ff8000, #ffee00, #22dd22, #00aaff, #8040ff, #ff40c0, #ff0040);
    filter:hue-rotate(0deg) saturate(1.2);
    animation:rbHue var(--rainbow-speed, 18s) linear infinite;
    mix-blend-mode:overlay;
  }
  #fxOverlay.rainbow-off .rainbow{ display:none; }

  #fxOverlay .shine{
    opacity:var(--sweep-alpha, .22);
    background:
      linear-gradient(var(--sweep-tilt, -14deg),
        transparent 30%,
        rgba(255,255,255,.75) 48%,
        rgba(255,255,255,.9) 50%,
        rgba(255,255,255,.75) 52%,
        transparent 70%);
    transform:translateX(-120%);
    animation:shineMove var(--sweep-speed, 5.5s) ease-in-out infinite;
  }
  #fxOverlay.sweep-off .shine{ display:none; }

  #fxOverlay.edgeglow-on::after{
    content:"";
    position:absolute; inset:0;
    border-radius:${CARD_RADIUS}px;
    box-shadow:0 0 0 2px rgba(var(--accent-rgb, 255,255,255), .35) inset,
               0 0 28px rgba(var(--accent-rgb, 255,255,255), var(--edge-strength, .6)) inset;
    animation:edgePulse 3.4s ease-in-out infinite;
    pointer-events:none;
  }

  #fxOverlay .sparkles{ position:absolute; inset:0; }
  #fxOverlay .sparkles .spk{
    position:absolute; left:50%; top:50%;
    width:var(--spk-size, 8px); height:var(--spk-size, 8px);
    background:
      radial-gradient(circle, rgba(255,255,255,.95) 0 40%, transparent 41% 100%),
      conic-gradient(from 0deg, rgba(255,255,255,.9), transparent 30% 70%, rgba(255,255,255,.9));
    border-radius:50%;
    opacity:.9;
    transform:translate(-50%,-50%) scale(.9);
    animation:spkTwinkle var(--spk-speed, 2.2s) ease-in-out infinite;
    mix-blend-mode:screen;
  }

  /* Keyframes */
  @keyframes rbHue { to { filter:hue-rotate(360deg) saturate(1.2); } }
  @keyframes shineMove {
    0%   { transform:translateX(-120%); }
    50%  { transform:translateX(120%); }
    100% { transform:translateX(120%); }
  }
  @keyframes edgePulse {
    0%,100% { box-shadow:0 0 0 2px rgba(var(--accent-rgb,255,255,255), .35) inset,
                        0 0 22px rgba(var(--accent-rgb,255,255,255), var(--edge-strength,.6)) inset; }
    50%     { box-shadow:0 0 0 2px rgba(var(--accent-rgb,255,255,255), .35) inset,
                        0 0 34px rgba(var(--accent-rgb,255,255,255), var(--edge-strength,.6)) inset; }
  }
  @keyframes spkTwinkle {
    0%,100% { opacity:.2; transform:translate(-50%,-50%) scale(.7) rotate(0deg); }
    50%     { opacity:1;  transform:translate(-50%,-50%) scale(1.15) rotate(45deg); }
  }
  `;
  document.head.appendChild(st);
}

function ensureOverlayEl(): HTMLDivElement {
  let el = document.getElementById('fxOverlay') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'fxOverlay';
    el.innerHTML = `
      <div class="layer pattern"></div>
      <div class="layer rainbow"></div>
      <div class="layer shine"></div>
      <div class="sparkles"></div>
    `;
    document.body.appendChild(el);
  } else {
    // Make sure the 4 layers exist
    const need = ['.pattern', '.rainbow', '.shine', '.sparkles'];
    for (const sel of need) {
      if (!el.querySelector(sel)) {
        const d = document.createElement('div');
        d.className = sel.replace('.', '');
        if (sel !== '.sparkles') d.classList.add('layer');
        el.appendChild(d);
      }
    }
  }
  return el;
}

/* ---------- scene + tier helpers ---------- */
function computeCardRect() {
  const topbar = document.querySelector('.topbar') as HTMLElement | null;
  const navbar = document.querySelector('.navbar') as HTMLElement | null;

  const topPad = (topbar?.offsetHeight ?? 0) + EXTRA_TOP;
  const bottomPad = (navbar?.offsetHeight ?? 0) + EXTRA_BOTTOM;

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  const usableW = Math.max(100, viewW);
  const usableH = Math.max(100, viewH - topPad - bottomPad);

  const maxW = Math.floor(usableW * MAX_WIDTH_FRAC);
  const maxH = Math.floor(usableH * MAX_HEIGHT_FRAC);

  const fitScale = Math.min(maxW / DESIGN_W, maxH / DESIGN_H);
  const scale = Math.max(0.2, fitScale * USER_SCALE);

  const cardW = DESIGN_W * scale;
  const cardH = DESIGN_H * scale;
  const x = Math.round((viewW - cardW) / 2);
  const y = Math.round((viewH - bottomPad - topPad - cardH) / 2 + topPad);

  return { x, y, w: Math.round(cardW), h: Math.round(cardH), scale };
}

function getCurrentTier(): Tier {
  const id = getCurrentItem();
  if (!id) return null;
  const inv = (state.inventory || []).find((i: any) => i.id === id);
  if (!inv) return null;
  return getTierById(inv.tierId) as any;
}

function hexToRgb(hex?: string): [number, number, number] {
  if (!hex) return [255, 255, 255];
  const s = hex.replace('#', '').trim();
  const n = parseInt(
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s,
    16
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------- sparkle builder ---------- */
function regenSparkles(el: HTMLDivElement, v: Visual) {
  const wrap = el.querySelector('.sparkles')!;
  if (!wrap) return;
  wrap.innerHTML = '';

  const on =
    v.overlaySparkles === true || typeof v.overlaySparkles === 'number';
  if (!on) return;

  const count =
    typeof v.overlaySparkles === 'number'
      ? v.overlaySparkles
      : v.overlaySparkleCount ?? 42;
  const size = v.overlaySparkleSize ?? 8;
  const sMin = v.overlaySparkleSpeedMin ?? 1.4;
  const sMax = v.overlaySparkleSpeedMax ?? 2.8;

  for (let i = 0; i < Math.max(0, Math.min(140, count)); i++) {
    const sp = document.createElement('span');
    sp.className = 'spk';
    const x = (Math.random() * 100).toFixed(2);
    const y = (Math.random() * 100).toFixed(2);
    const rot = (Math.random() * 360).toFixed(1);
    const spd = (sMin + Math.random() * (sMax - sMin)).toFixed(2);
    const delay = (Math.random() * 2.0).toFixed(2);
    const scale = (0.6 + Math.random() * 0.9).toFixed(2);
    sp.style.left = `${x}%`;
    sp.style.top = `${y}%`;
    sp.style.setProperty('--spk-size', `${size}px`);
    sp.style.setProperty('--spk-speed', `${spd}s`);
    sp.style.animationDelay = `${delay}s`;
    sp.style.transform = `translate(-50%,-50%) scale(${scale}) rotate(${rot}deg)`;
    wrap.appendChild(sp);
  }
}

/* ---------- hole punch ---------- */
interface Hole {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
} // in design units
let holesDesign: Hole[] = [];

function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    `Z`,
  ].join(' ');
}

function applyHoles(el: HTMLDivElement, card: { w: number; h: number }) {
  const supportsPath =
    typeof CSS !== 'undefined' &&
    (CSS as any).supports?.('clip-path', 'path("M0 0 H10")');

  // Scale scratch-cell rects from design space to the live card size
  const sx = card.w / DESIGN_W;
  const sy = card.h / DESIGN_H;

  const holesPx = (holesDesign || []).map((h) => ({
    x: h.x * sx,
    y: h.y * sy,
    w: h.w * sx,
    h: h.h * sy,
    r: (h.r ?? 16) * sx, // scale radius with width; good enough visually
  }));

  let clip: string;

  if (!supportsPath || holesPx.length === 0) {
    // Fallback: no hole punching, just the rounded card outline
    clip = `inset(0 round ${CARD_RADIUS}px)`;
  } else {
    const outer = roundedRectPath(0, 0, card.w, card.h, CARD_RADIUS);
    const holesPath = holesPx
      .map((h) => roundedRectPath(h.x, h.y, h.w, h.h, h.r || 0))
      .join(' ');

    // Try both evenodd syntaxes; different engines have differed historically
    const candidate1 = `path('evenodd ${outer} ${holesPath}')`;
    const candidate2 = `path('evenodd, ${outer} ${holesPath}')`;

    clip =
      ((CSS as any).supports?.('clip-path', candidate1) && candidate1) ||
      ((CSS as any).supports?.('clip-path', candidate2) && candidate2) ||
      `inset(0 round ${CARD_RADIUS}px)`;
  }

  el.style.clipPath = clip;
  el.style.setProperty('-webkit-clip-path', clip);
}

/* ---------- core apply ---------- */
function applyTier(el: HTMLDivElement, t: Tier) {
  const v = t?.visual || {};

  // visible only when tier has rainbow or an overlay image
  const hasBase = !!(v.holoOverlay || v.foilOverlay);
  const show = !!(v.overlayRainbow || hasBase);
  if (!show) {
    el.style.opacity = '0';
    return;
  }

  // set vars on root
  const url = v.holoOverlay || v.foilOverlay || '';
  const alpha = Number.isFinite(v.overlayAlpha as any)
    ? Number(v.overlayAlpha)
    : 0.26;
  el.style.setProperty('--overlay-image', url ? `url("${url}")` : 'none');
  el.style.setProperty('--overlay-alpha', String(alpha));

  const rbAlpha = Number.isFinite(v.overlayRainbowAlpha as any)
    ? Number(v.overlayRainbowAlpha)
    : 0.32;
  const rbSpeed = Number.isFinite(v.overlayRainbowSpeed as any)
    ? Number(v.overlayRainbowSpeed)
    : 18;
  el.style.setProperty('--rainbow-alpha', String(rbAlpha));
  el.style.setProperty('--rainbow-speed', `${rbSpeed}s`);
  el.classList.toggle('rainbow-off', !v.overlayRainbow);

  const sweepAlpha = Number.isFinite(v.overlaySweepAlpha as any)
    ? Number(v.overlaySweepAlpha)
    : 0.22;
  const sweepSpeed = Number.isFinite(v.overlaySweepSpeed as any)
    ? Number(v.overlaySweepSpeed)
    : 5.5;
  const sweepTilt = Number.isFinite(v.overlaySweepTilt as any)
    ? Number(v.overlaySweepTilt)
    : -14;
  el.style.setProperty('--sweep-alpha', String(sweepAlpha));
  el.style.setProperty('--sweep-speed', `${sweepSpeed}s`);
  el.style.setProperty('--sweep-tilt', `${sweepTilt}deg`);
  el.classList.toggle('sweep-off', v.overlaySweep === false);

  const [r, g, b] = hexToRgb(v.accentHex);
  el.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  const edgeStrength = Number.isFinite(v.overlayEdgeGlowStrength as any)
    ? Number(v.overlayEdgeGlowStrength)
    : 0.6;
  el.style.setProperty(
    '--edge-strength',
    String(Math.max(0, Math.min(1, edgeStrength)))
  );
  el.classList.toggle('edgeglow-on', v.overlayEdgeGlow !== false);

  // sparkles
  regenSparkles(el, v);

  // finally show
  el.style.opacity = '1';
}

function position(el: HTMLDivElement) {
  const r = computeCardRect();
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${r.w}px`;
  el.style.height = `${r.h}px`;
  el.style.borderRadius = `${CARD_RADIUS}px`;
  applyHoles(el, r);
}

/* ---------- event plumbing ---------- */
let enabled = false;
let lastTier: string | null = null;

function tick() {
  if (!enabled) return;

  const el = ensureOverlayEl();
  const tier = getCurrentTier();

  // No tier? keep overlay hidden and clear cache
  if (!tier) {
    el.style.opacity = '0';
    lastTier = null;
    return;
  }

  const tId = tier.id;

  // Re-apply when tier changed, OR when we just re-enabled and opacity is 0
  if (tId !== lastTier || el.style.opacity !== '1') {
    applyTier(el, tier);
    lastTier = tId;
  }

  position(el); // always keep sizing/holes in sync
}

function show() {
  enabled = true;
  // force re-apply even if we open the same tier as last time
  lastTier = null;
  injectCSS();
  ensureOverlayEl();
  tick(); // do an immediate pass
}

function hide() {
  enabled = false;
  // reset cached tier so next entry always reapplies styles
  lastTier = null;

  const el = document.getElementById('fxOverlay') as HTMLDivElement | null;
  if (el) {
    el.style.opacity = '0';
    el.style.removeProperty('clip-path');
    el.style.removeProperty('-webkit-clip-path');
  }
}

/* public-ish events:
   - fx:enable / fx:disable
   - fx:set-holes  detail:{rects:[{x,y,w,h,r?}]} in DESIGN coords
   - fx:reposition (optional nudge to recompute)
*/
window.addEventListener('fx:enable', show);
window.addEventListener('fx:disable', hide);
window.addEventListener('fx:set-holes', (e: any) => {
  holesDesign = Array.isArray(e?.detail?.rects) ? e.detail.rects : [];
  tick();
});
window.addEventListener('fx:reposition', tick);
window.addEventListener('resize', tick);

// run once so Inventory (no overlay) doesn’t throw
injectCSS();
ensureOverlayEl();
hide();

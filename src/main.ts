import { Application } from 'pixi.js';
import './styles.css';
import { SceneManager } from './core/sceneManager';
import type { SceneKey } from './core/sceneManager';

import { state, saveNow } from './core/state';
import './ui/animatedOverlay';
import { discoverLofi, Bgm } from './core/bgm';
import './ui/settings';
import './ui/badgesNotify';
import './ui/sfx-wiring';

/* ---------- Which DOM panels are visible in each scene ---------- */
const scenePanels: Partial<Record<SceneKey, string[]>> = {
  VendingMachine: ['vendorPanel'],
  Inventory: ['inventoryPanel'],
  Upgrades: ['upgradesPanel'],
  Stats: ['statsPanel'],
  Profile: ['profilePanel'],
  Scratch: ['winbar'], // claim button is controlled by ScratchView
  Settings: ['settingsPanel'],
};

function setUIForScene(scene: SceneKey) {
  const want = new Set(
    (scenePanels[scene] ?? []).map((id) => id.toLowerCase())
  );
  const ALL =
    '#vendorPanel, #inventoryPanel, #upgradesPanel, #statsPanel, #profilePanel, #settingsPanel, #winbar';
  document.querySelectorAll<HTMLElement>(ALL).forEach((el) => {
    el.style.display = want.has(el.id.toLowerCase()) ? '' : 'none';
  });
}

(window as any).__SET_SCENE_UI__ = (scene: SceneKey) => setUIForScene(scene);

/* ---------------- PIXI APP ---------------- */
const appDiv = document.getElementById('app') as HTMLDivElement;

// Common options
const opts: any = {
  backgroundAlpha: 0,
  resizeTo: appDiv,
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 1.5),
  powerPreference: 'high-performance',
  failIfMajorPerformanceCaveat: false,
  // v8-only hint; harmless on v7
  preference: 'webgl',
};

// Create the app in a way that works for both v8 and v7
let app: any;

if (typeof (Application as any).prototype?.init === 'function') {
  // PIXI v8 style
  app = new Application();
  await app.init(opts);
} else {
  // PIXI v7 style
  app = new (Application as any)(opts);
}

// Helper to get the canvas across v8 (canvas) and v7 (view)
const getCanvas = (): HTMLCanvasElement | null =>
  (app?.canvas as HTMLCanvasElement) ??
  (app?.view as HTMLCanvasElement) ??
  null;

// Append canvas after init so it definitely exists
const canvas = getCanvas();
if (canvas) appDiv.appendChild(canvas);

// Listen for GPU context restore safely
canvas?.addEventListener('webglcontextrestored', () => {
  console.warn('[Pixi] context restored – relayout current scene');
  onResize();
});

// Scene manager
const scenes = new SceneManager(app);

/* ---------------- HUD ---------------- */
function refreshHUD() {
  const m = document.getElementById('money') as HTMLSpanElement | null;
  if (m) m.textContent = `$${state.money.toLocaleString()}`;
  const t = document.getElementById('tokens') as HTMLSpanElement | null;
  if (t) t.textContent = String(state.tokens);
  const lvl = document.getElementById('level') as HTMLSpanElement | null;
  if (lvl) lvl.textContent = String(state.vendorLevel);
}
refreshHUD();
(window as any).__REFRESH_HUD__ = refreshHUD;

// Default autoReturn ON for new installs
if (!state.flags) state.flags = {};
if (typeof state.flags.autoReturn === 'undefined') {
  state.flags.autoReturn = true;
  saveNow();
  const prefAuto = document.getElementById(
    'prefAutoReturn'
  ) as HTMLInputElement | null;
  if (prefAuto) prefAuto.checked = true;
}

/* ---------------- BACKGROUND MUSIC ---------------- */
const bgm = new Bgm(discoverLofi());
try {
  if (localStorage.getItem('bgmVol') == null) bgm.setVolume(0.05);
} catch {}
(window as any).__BGM__ = bgm;
window.dispatchEvent(new Event('bgm-ready'));

// Autoplay policy: start after first gesture
const kick = () => {
  bgm.start().catch(() => {});
  window.removeEventListener('pointerdown', kick);
  window.removeEventListener('keydown', kick);
};
window.addEventListener('pointerdown', kick, { once: true });
window.addEventListener('keydown', kick, { once: true });

/* Reduce the “FOUC” warning */
if (document.readyState !== 'complete') {
  await new Promise<void>((r) =>
    window.addEventListener('load', () => r(), { once: true })
  );
}
if ((document as any).fonts?.ready) {
  try {
    await (document as any).fonts.ready;
  } catch {}
}

/* ---------------- NAV ---------------- */
document
  .querySelectorAll<HTMLButtonElement>('.nav-btn[data-scene]')
  .forEach((btn) => {
    btn.addEventListener(
      'pointerdown',
      () => {
        const target = btn.dataset.scene as SceneKey;
        scenes.goto(target);
        setUIForScene(target);

        const settingsPanel = document.getElementById('settingsPanel')!;
        if (target === 'Settings') settingsPanel.classList.toggle('show');
        else settingsPanel.classList.remove('show');

        queueMicrotask(onResize);
      },
      { passive: true }
    ); // keep it passive = faster scrolling/gestures
  });

/* ---------------- CLAIM BUTTON ---------------- */
(document.getElementById('claim') as HTMLButtonElement).style.display = 'none';

/* ---------------- LAYOUT ---------------- */
// Size the canvas CSS to the container and resize the renderer
function cssCanvasSize() {
  const c = getCanvas();
  if (!c || !c.isConnected) return { w: 0, h: 0 };
  const rect = appDiv.getBoundingClientRect(); // measure container, not canvas
  c.style.width = rect.width + 'px';
  c.style.height = rect.height + 'px';
  return {
    w: Math.max(1, Math.round(rect.width)),
    h: Math.max(1, Math.round(rect.height)),
  };
}

function onResize() {
  const c = getCanvas();
  if (!c) return; // not ready yet
  const { w, h } = cssCanvasSize();
  if (w === 0 || h === 0) return;

  // Both v7 and v8 support resize(w, h)
  app.renderer.resize(w, h);

  // Let scenes lay out their content
  scenes.layout(w, h);
}

(window as any).__APP__ = app;
(window as any).__SCENES__ = scenes;

// Observe the container (stable) rather than the canvas (which might be null early)
const ro = new ResizeObserver(() => onResize());
ro.observe(appDiv);

// Also handle window + visual viewport changes
if ((window as any).visualViewport) {
  (window as any).visualViewport.addEventListener('resize', onResize);
  (window as any).visualViewport.addEventListener('scroll', onResize);
}
window.addEventListener('resize', onResize);

/* ---------------- START ---------------- */
scenes.goto('Inventory');
setUIForScene('Inventory');
onResize();

/* ---------------- HMR cleanup ---------------- */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      (scenes as any)?.clearAll?.();
    } catch {}
    // Destroy app; v7/v8 both accept this form
    app.destroy(true, { children: true, texture: false, baseTexture: false });
  });
}

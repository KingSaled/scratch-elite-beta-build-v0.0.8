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
  const want = new Set((scenePanels[scene] ?? []).map((id) => id.toLowerCase()));
  const ALL =
    '#vendorPanel, #inventoryPanel, #upgradesPanel, #statsPanel, #profilePanel, #settingsPanel, #winbar';
  document.querySelectorAll<HTMLElement>(ALL).forEach((el) => {
    el.style.display = want.has(el.id.toLowerCase()) ? '' : 'none';
  });
}

(window as any).__SET_SCENE_UI__ = (scene: SceneKey) => setUIForScene(scene);

/* ---------------- PIXI APP ---------------- */
const appDiv = document.getElementById('app') as HTMLDivElement;

// Ensure exactly ONE canvas (reuse if one already exists)
const canvas: HTMLCanvasElement = (() => {
  const existing = appDiv.querySelector('canvas') as HTMLCanvasElement | null;
  if (existing) return existing;
  const c = document.createElement('canvas');
  appDiv.appendChild(c);
  return c;
})();

// Create a single Pixi Application and initialize it once
const app = new Application();

async function initRenderer() {
  try {
    await app.init({
      backgroundAlpha: 0,
      antialias: false,                // safer on strict Firefox/ANGLE combos
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false,
      resizeTo: window,                // guarantees non-zero canvas size
      autoDensity: true,
      view: canvas,                    // use the canvas we appended
      // preference: 'webgl',          // optional hint; commented to avoid v7/v8 differences
    });
  } catch (err) {
    // Show a friendly notice instead of crashing silently
    const msg = document.createElement('div');
    msg.style.position = 'fixed';
    msg.style.inset = '80px 16px 16px 16px';
    msg.style.background = 'rgba(15,18,26,0.9)';
    msg.style.backdropFilter = 'blur(6px)';
    msg.style.border = '1px solid rgba(255,255,255,0.12)';
    msg.style.borderRadius = '14px';
    msg.style.padding = '16px 18px';
    msg.style.color = '#e8eefc';
    msg.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    msg.style.zIndex = '9999';
    msg.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px;font-size:16px">Graphics renderer failed to start</div>
      <div style="opacity:.9;line-height:1.5;margin-bottom:10px">
        Your browser blocked WebGL on this machine. The game can still run by enabling Pixi’s Canvas fallback.
      </div>
      <ol style="opacity:.9;line-height:1.5;margin:0 0 10px 16px">
        <li>Install the Pixi canvas packages in the repo:
          <code style="background:rgba(255,255,255,.08);padding:2px 6px;border-radius:6px;display:inline-block;margin-top:4px">
            npm i @pixi/canvas-renderer@7.4.3 @pixi/canvas-display@7.4.3 @pixi/canvas-sprite@7.4.3 @pixi/canvas-graphics@7.4.3 @pixi/canvas-text@7.4.3
          </code>
        </li>
        <li>Add these imports at the top of <code>main.ts</code> (after the styles import):<br/>
          <code style="background:rgba(255,255,255,.08);padding:2px 6px;border-radius:6px;display:block;margin-top:6px;white-space:pre">
import '@pixi/canvas-renderer';
import '@pixi/canvas-display';
import '@pixi/canvas-sprite';
import '@pixi/canvas-graphics';
import '@pixi/canvas-text';</code>
        </li>
      </ol>
      <div style="opacity:.8">Or test in a browser/profile where WebGL is enabled (Chrome/Edge typically work out of the box).</div>
    `;
    document.body.appendChild(msg);
    console.error('Pixi renderer init failed:', err);
    return false;
  }
  return true;
}

const ok = await initRenderer();
if (!ok) {
  // Stop boot if renderer isn't available
  throw new Error('Renderer unavailable');
}

// (Optional) handle GPU context restoration
canvas.addEventListener('webglcontextrestored', () => {
  console.warn('[Pixi] context restored – relayout current scene');
  try { (onResize as any)?.(); } catch {}
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
  const prefAuto = document.getElementById('prefAutoReturn') as HTMLInputElement | null;
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
  await new Promise<void>((r) => window.addEventListener('load', () => r(), { once: true }));
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
  const c = canvas;
  if (!c || !c.isConnected) return { w: 0, h: 0 };

  // Measure the container, not the canvas
  const rect = appDiv.getBoundingClientRect();

  // Keep CSS size in sync with the container (absolute/inset:0 will also fill it)
  c.style.width = rect.width + 'px';
  c.style.height = rect.height + 'px';

  return {
    w: Math.max(1, Math.round(rect.width)),
    h: Math.max(1, Math.round(rect.height)),
  };
}

function onResize() {
  const c = canvas;
  if (!c || !c.isConnected) return; // not ready yet

  const { w, h } = cssCanvasSize();
  if (w === 0 || h === 0) return;

  // Resize PIXI renderer
  app.renderer.resize(w, h);

  // Let scenes lay out their content
  scenes.layout(w, h);
}

// Expose for debugging
(window as any).__APP__ = app;
(window as any).__SCENES__ = scenes;

// Observe the container (stable) rather than the canvas
const ro = new ResizeObserver(() => onResize());
ro.observe(appDiv);

// Also handle window + visual viewport changes
if ((window as any).visualViewport) {
  (window as any).visualViewport.addEventListener('resize', onResize, { passive: true });
  (window as any).visualViewport.addEventListener('scroll', onResize, { passive: true });
}
window.addEventListener('resize', onResize, { passive: true });

// Initial layout
onResize();

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
    // Destroy app; v7 accepts this signature
    app.destroy(true, { children: true, texture: false, baseTexture: false });
  });
}

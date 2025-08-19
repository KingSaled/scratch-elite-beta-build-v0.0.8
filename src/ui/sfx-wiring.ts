// src/ui/sfx-wiring.ts
import { sfx } from '../core/sfx'; // <- no .js in TS source

function onReady(fn: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else fn();
}

onReady(() => {
  /* --- Nav --- */
  document
    .querySelectorAll<HTMLButtonElement>('.nav-btn[data-scene]')
    .forEach((btn) =>
      btn.addEventListener('pointerdown', () => sfx.playKey('nav'), {
        passive: true,
      })
    );

  /* --- Buttons (confirm vs danger) --- */
  document.addEventListener(
    'pointerdown',
    (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest('.btn');
      if (!el) return;
      if (el.classList.contains('btn-danger')) sfx.playKey('cancel');
      else sfx.playKey('btn');
    },
    { passive: true }
  );

  /* --- Toggles & sliders in Settings --- */
  const settings = document.getElementById('settingsPanel');
  if (settings) {
    settings.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement | null;
      if (!t) return;
      if (t.type === 'checkbox') sfx.playKey('toggle');
      if (t.type === 'range') sfx.playKey('slide');
    });
  }

  /* --- Inventory: RIP for sealed tickets --- */
  const inv = document.getElementById('inventoryPanel');
  if (inv) {
    const RIP_CLICK_SEL =
      '.ticket, [data-ticket-id], .ticket-card, .inventory-item, [data-action]';
    inv.addEventListener('pointerdown', (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest(RIP_CLICK_SEL);
      if (!el) return;

      const state =
        el.getAttribute('data-ticket-state') ||
        (el as any).dataset?.state ||
        '';
      const isSealed =
        /sealed/i.test(state) ||
        el.classList.contains('sealed') ||
        el.getAttribute('data-action') === 'open-ticket' ||
        el.getAttribute('data-action') === 'scratch' ||
        el.getAttribute('data-open') === 'ticket';

      if (isSealed) sfx.playKey('rip');
    });
  }

  /* --- Win jingle when a ticket is claimed (from state.ts dispatch) --- */
  window.addEventListener('ticket-claimed', (e: any) => {
    if (e?.detail?.isWin) sfx.playKey('win');
  });

  /* --- Token / Level / Unlock / Badge earned --- */
  window.addEventListener('tokens-added', (e: any) => {
    if ((e?.detail?.n ?? 0) > 0) sfx.playKey('token');
  });
  window.addEventListener('tokens-spent', () => sfx.playKey('cancel'));
  window.addEventListener('vendor-level-up', () => sfx.playKey('levelup'));
  window.addEventListener('tier-unlocked', () => sfx.playKey('unlock'));
  window.addEventListener('badge-earned', () => sfx.playKey('badge'));

  /* --- Modal open/close sounds (generic, works for vendor unlock sheet) --- */
  const MODAL_SEL = '.modal, [role="dialog"], .dialog, .sheet';

  const isVisible = (el: HTMLElement) =>
    el.isConnected &&
    (el.classList.contains('show') ||
      (el as any).open === true ||
      el.style.display !== 'none' ||
      el.getAttribute('aria-hidden') === 'false' ||
      el.getAttribute('aria-modal') === 'true');

  // initial scan (in case a modal mounts visible)
  document.querySelectorAll<HTMLElement>(MODAL_SEL).forEach((el) => {
    if (isVisible(el)) sfx.playKey('modal-open');
  });

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      // attributes changes on a known modal
      if (m.type === 'attributes') {
        const el = m.target as HTMLElement;
        if (!el.matches?.(MODAL_SEL)) continue;
        if (
          m.attributeName === 'class' ||
          m.attributeName === 'style' ||
          m.attributeName === 'open'
        ) {
          const now = isVisible(el);
          const was = (el as any).__lastVisible__ ?? false;
          if (now !== was) sfx.playKey(now ? 'modal-open' : 'modal-close');
          (el as any).__lastVisible__ = now;
        }
      }

      // node additions/removals (new dialogs or sheets)
      if (m.type === 'childList') {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches(MODAL_SEL)) {
            (n as any).__lastVisible__ = isVisible(n);
            sfx.playKey('modal-open');
          } else {
            const found = n.querySelector?.(MODAL_SEL) as HTMLElement | null;
            if (found) {
              (found as any).__lastVisible__ = isVisible(found);
              sfx.playKey('modal-open');
            }
          }
        });
        m.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches(MODAL_SEL) || n.querySelector?.(MODAL_SEL)) {
            sfx.playKey('modal-close');
          }
        });
      }
    }
  });
  mo.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'open', 'aria-hidden', 'aria-modal'],
  });
});

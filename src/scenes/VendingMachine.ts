import { Container } from 'pixi.js';
import { getTiers } from '../data/content.js';
import {
  state,
  saveNow,
  addVendorXp,
  isTierUnlocked,
  getUnlockStatus,
  unlockTier,
} from '../core/state.js';
import { nextLevelXP } from '../core/progression.js';
import { getDiscountedTotal, getEffects } from '../core/upgrades.js';
import { toast } from '../ui/alerts.js';
import { nextSerialForTier } from '../core/serials.js';
import { addLifetimeSpent } from '../core/state.js';
import { sfx } from '../core/sfx.ts';

function fmtMoney(n: number) {
  return `$${Math.max(0, Math.floor(n)).toLocaleString()}`;
}

// --- lightweight image pre-cache for vendor & elsewhere ---
const _imgCache = new Map<string, Promise<string>>();

function preloadImage(url: string): Promise<string> {
  if (!url) return Promise.resolve('');
  if (_imgCache.has(url)) return _imgCache.get(url)!;
  const p = new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.loading = 'eager';
    img.onload = () => resolve(url);
    img.onerror = () => resolve(url); // resolve anyway; we'll still set bg
    img.src = url;
  });
  _imgCache.set(url, p);
  return p;
}

let _precacheDone = false;
async function precacheAllTierArt() {
  if (_precacheDone) return;
  _precacheDone = true;

  // re-import to avoid any potential circular timing (safe even if redundant)
  const { getTiers } = await import('../data/content.js');
  const tiers = getTiers();

  const urls = new Set<string>();
  for (const t of tiers) {
    const v: any = t.visual || {};
    if (v.bgImage) urls.add(v.bgImage);
    if (v.coverImage) urls.add(v.coverImage);
    if (v.holoOverlay) urls.add(v.holoOverlay);
    if (v.foilOverlay) urls.add(v.foilOverlay);
    if (v.tierBadge) urls.add(v.tierBadge);
  }
  await Promise.all([...urls].map(preloadImage));
}

const PRINT_BASE = `${import.meta.env.BASE_URL}sfx/print`;

function pickPrintSrc(audio: HTMLAudioElement) {
  // Prefer OGG if supported, otherwise MP3, otherwise default to OGG
  const ogg = audio.canPlayType('audio/ogg; codecs="vorbis"');
  if (ogg === 'probably' || ogg === 'maybe') return `${PRINT_BASE}.ogg`;

  const mp3 = audio.canPlayType('audio/mpeg');
  if (mp3 === 'probably' || mp3 === 'maybe') return `${PRINT_BASE}.mp3`;

  return `${PRINT_BASE}.ogg`;
}

export class VendingMachine extends Container {
  private panel = document.getElementById('vendorPanel') as HTMLDivElement;
  private grid = document.getElementById('vendorGrid') as HTMLDivElement;
  private buyBtn = document.getElementById('btnBuy') as HTMLButtonElement;
  private vendorMeta = document.getElementById(
    'vendorMeta'
  ) as HTMLDivElement | null;

  // Optional quantity input (free-form). Radios still work; precedence handled by qtySource.
  private qtyInput = document.getElementById(
    'buyQtyInput'
  ) as HTMLInputElement | null;

  // GLOBAL overlay (not inside vendor)
  private unlockPanel = document.getElementById(
    'unlockPanel'
  ) as HTMLDivElement | null;
  private unlockTitle = document.getElementById(
    'unlockTitle'
  ) as HTMLDivElement | null;
  private unlockReqs = document.getElementById(
    'unlockReqs'
  ) as HTMLDivElement | null;
  private unlockBtn = document.getElementById(
    'btnUnlock'
  ) as HTMLButtonElement | null;
  private unlockClose = document.getElementById(
    'btnUnlockClose'
  ) as HTMLButtonElement | null;

  private selectedTierId: string | null = null;
  private buying = false;

  // quantity precedence tracking
  private qtySource: 'radio' | 'custom' = 'radio';

  // lightweight sfx (add /sfx/print.mp3 or print.ogg to your public folder)
  private printAudio: HTMLAudioElement | null = null;

  constructor() {
    super();

    // sound init (don’t break if file missing)
    try {
      this.printAudio = new Audio();
      this.printAudio.preload = 'auto';

      this.printAudio.src = pickPrintSrc(this.printAudio);

      const sync = () => {
        this.printAudio!.volume = sfx.isMuted() ? 0 : sfx.getVolume();
      };
      sync();
      sfx.events.addEventListener('volumechange', sync);
      sfx.events.addEventListener('mutechange', sync);

      this.printAudio.onerror = () =>
        console.warn('[sfx] failed to load:', this.printAudio?.src);
      this.printAudio.load();
    } catch {
      this.printAudio = null as any;
    }

    // basic events
    this.buyBtn.onclick = () => this.buySelected();
    if (this.unlockClose) this.unlockClose.onclick = () => this.hideUnlock();
    if (this.unlockBtn) this.unlockBtn.onclick = () => this.confirmUnlock();

    // radios: if a radio is chosen, it wins; reset custom to 0
    Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="buyQty"]')
    ).forEach((r) =>
      r.addEventListener('change', () => {
        this.qtySource = 'radio';
        if (this.qtyInput) this.qtyInput.value = '0';
        this.updateBuyButton();
      })
    );

    // free-form qty: only “wins” when focused/typed
    if (this.qtyInput) {
      this.qtyInput.min = '0'; // 0 means inactive until you type
      this.qtyInput.max = '9999';
      this.qtyInput.step = '1';
      if (!this.qtyInput.value) this.qtyInput.value = '0';
      this.qtyInput.addEventListener('focus', () => {
        this.qtySource = 'custom';
        this.updateBuyButton();
      });
      this.qtyInput.addEventListener('input', () => {
        this.qtySource = 'custom';
        this.updateBuyButton();
      });
      this.qtyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      });
      this.qtyInput.addEventListener('blur', () => this.sanitizeQty());
    }
  }

  onEnter() {
    this.panel.classList.add('show', 'vending-skin');
    precacheAllTierArt(); // warm the cache ASAP
    this.render();
    this.updateVendorMeta();
  }
  onExit() {
    this.panel.classList.remove('show', 'vending-skin');
    this.hideUnlock();
  }
  layout() {}

  private sanitizeQty() {
    if (!this.qtyInput) return;
    // keep 0 as “inactive” when custom isn’t intended; otherwise clamp 1..9999
    const raw = Math.floor(Number(this.qtyInput.value) || 0);
    const n = raw === 0 ? 0 : Math.max(1, Math.min(9999, raw));
    this.qtyInput.value = String(n);
  }

  private getQty(): number {
    if (this.qtySource === 'custom' && this.qtyInput) {
      const n = Math.floor(Number(this.qtyInput.value) || 0);
      // 0 means inactive → handled by updateBuyButton()
      if (n >= 0 && n <= 9999) return n;
    }
    // Fallback to radios (1/5/10)
    const r = document.querySelector<HTMLInputElement>(
      'input[name="buyQty"]:checked'
    );
    const v = r ? Number(r.value) : 1;
    return v === 5 || v === 10 ? v : 1;
  }

  private updateTopbarLevel() {
    const lvl = document.getElementById('level') as HTMLSpanElement | null;
    if (lvl) lvl.textContent = String(state.vendorLevel);
  }
  private updateVendorMeta() {
    if (!this.vendorMeta) return;
    const next = nextLevelXP(state.vendorLevel);
    this.vendorMeta.textContent = next
      ? `Vendor Lvl ${state.vendorLevel} • XP ${state.vendorXp}/${next}`
      : `Vendor Lvl ${state.vendorLevel} • MAX`;
  }

  private render() {
    this.grid.innerHTML = '';

    const tiers = getTiers()
      .slice()
      .sort((a, b) => a.price - b.price);

    for (const t of tiers) {
      const v: any = t.visual || {};

      // --- Slot wrapper (button-like for a11y)
      const slot = document.createElement('div');
      slot.className = 'vm-slot';
      slot.setAttribute('role', 'button');
      slot.setAttribute('tabindex', '0');

      // progressive BG load to avoid “pop-in”
      const bgURL = v.bgImage || '';
      slot.classList.add('loading');
      slot.style.setProperty('--bg', 'linear-gradient(#0f1723,#0b1220)'); // placeholder
      if (bgURL) {
        // kick off cache; result not strictly needed here but warms pipeline
        preloadImage(bgURL);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = bgURL;
        img.onload = () => {
          slot.style.setProperty('--bg', `url("${bgURL}")`);
          slot.classList.remove('loading');
          slot.classList.add('loaded');
        };
        img.onerror = () => {
          slot.classList.remove('loading');
          slot.classList.add('loaded');
        };
      } else {
        slot.classList.remove('loading');
        slot.classList.add('loaded');
      }

      // title ribbon
      const name = document.createElement('div');
      name.className = 'vm-name';
      name.textContent = t.name || 'Ticket';

      // price tag (bottom-left)
      const price = document.createElement('div');
      price.className = 'vm-price';
      price.textContent = fmtMoney(t.price);

      // tier badge (bottom-right)
      const badgeWrap = document.createElement('div');
      badgeWrap.className = 'vm-badge';
      const badgeURL = v.tierBadge as string | undefined;
      if (badgeURL) {
        const badgeImg = document.createElement('img');
        badgeImg.src = badgeURL;
        badgeImg.alt = `${t.set || 'Tier'} badge`;
        badgeImg.decoding = 'async';
        badgeImg.loading = 'eager';
        badgeWrap.appendChild(badgeImg);
      } else {
        const pill = document.createElement('span');
        pill.textContent = (t.set || 'Tier').toUpperCase();
        badgeWrap.appendChild(pill);
      }

      // lock overlay if not unlocked
      const locked =
        !isTierUnlocked(t.id) &&
        (t.unlock.tokens > 0 ||
          t.unlock.vendorLevel > 1 ||
          t.unlock.lifetimeWinnings > 0);

      if (locked) {
        slot.classList.add('locked');
        const lock = document.createElement('div');
        lock.className = 'vm-lock'; // CSS ::after draws the centered red pill
        slot.append(lock);

        slot.onclick = () => this.openUnlock(t.id, t.name);
        slot.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') this.openUnlock(t.id, t.name);
        };
      } else {
        slot.onclick = () => this.selectTier(slot, t.id);
        slot.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') this.selectTier(slot, t.id);
        };
      }

      // build DOM tree
      slot.append(name, price, badgeWrap);
      this.grid.appendChild(slot);
    }

    this.updateBuyButton();
  }

  private selectTier(el: Element, tierId: string) {
    this.selectedTierId = tierId;
    this.grid
      .querySelectorAll('.vm-slot')
      .forEach((n) => n.classList.remove('selected'));
    el.classList.add('selected');
    this.updateBuyButton();
  }

  private updateBuyButton() {
    const qty = this.getQty();
    const t = getTiers().find((tt) => tt.id === this.selectedTierId);
    if (!t) {
      this.buyBtn.disabled = true;
      this.buyBtn.textContent = 'Select a Ticket';
      return;
    }

    if (this.qtySource === 'custom' && qty < 1) {
      this.buyBtn.disabled = true;
      this.buyBtn.textContent = 'Enter quantity';
      return;
    }

    const base = t.price * qty;
    const cost = getDiscountedTotal(t.price, qty);
    const { ticketDiscountPct } = getEffects();
    const affordable = state.money >= cost;

    this.buyBtn.disabled = !affordable;
    this.buyBtn.textContent =
      ticketDiscountPct > 0
        ? `Buy ${qty}× — ${fmtMoney(
            cost
          )}  (−${ticketDiscountPct}% from ${fmtMoney(base)})`
        : `Buy ${qty}× — ${fmtMoney(cost)}`;
  }

  private buySelected() {
    if (this.buying) return;
    this.buying = true;
    try {
      const qty = this.getQty();
      const t = getTiers().find((tt) => tt.id === this.selectedTierId);
      if (!t) return;

      if (this.qtySource === 'custom' && qty < 1) {
        toast('Enter a quantity first.', 'warn');
        return;
      }

      const cost = getDiscountedTotal(t.price, qty);
      if (state.money < cost) {
        toast('Not enough Cash.', 'warn');
        return;
      }

      // record lifetime spend (for net profit)
      addLifetimeSpent(cost);

      // sfx
      try {
        if (this.printAudio) {
          this.printAudio.currentTime = 0;
          this.printAudio.play()?.catch(() => {});
        }
      } catch {}

      state.money -= cost;
      const beforeLevel = state.vendorLevel;
      addVendorXp(Math.round(t.price * 0.5 * qty));

      // Create tickets + custom serials
      const now = Date.now();
      for (let i = 0; i < qty; i++) {
        const serialId = nextSerialForTier(t.id);
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? `inv_${(crypto as any).randomUUID()}`
            : `inv_${now}_${i}_${Math.random().toString(36).slice(2, 8)}`;
        state.inventory.push({
          id,
          tierId: t.id,
          serialId,
          createdAt: Date.now(),
          state: 'sealed',
        });
      }

      saveNow();

      const moneyEl = document.getElementById(
        'money'
      ) as HTMLSpanElement | null;
      if (moneyEl) moneyEl.textContent = `$${state.money.toLocaleString()}`;

      toast(
        `Bought ${qty}× ${t.name} for $${cost.toLocaleString()}`,
        'success'
      );
      this.updateBuyButton();

      if (state.vendorLevel !== beforeLevel) this.updateTopbarLevel();
      this.updateVendorMeta();
    } finally {
      this.buying = false;
    }
  }

  // --- Unlock (global overlay) ---
  private openUnlock(tierId: string, name: string) {
    if (
      !this.unlockPanel ||
      !this.unlockTitle ||
      !this.unlockReqs ||
      !this.unlockBtn
    )
      return;

    const s = getUnlockStatus(tierId);
    if (!s) return;

    this.unlockTitle.textContent = `Unlock “${name}”`;
    this.unlockReqs.innerHTML = `
      <div class="req ${s.hasLvl ? 'ok' : 'no'}">Vendor Level ≥ ${
      s.needLvl
    }</div>
      <div class="req ${s.hasTok ? 'ok' : 'no'}">Tokens ≥ ${s.needTok}</div>
      <div class="req ${
        s.hasWin ? 'ok' : 'no'
      }">Lifetime Winnings ≥ $${s.needWin.toLocaleString()}</div>
    `;
    this.unlockBtn.disabled = !s.ok;
    (this.unlockBtn as any).dataset.tier = tierId;

    this.unlockPanel.style.zIndex = '2147483647';
    this.unlockPanel.style.display = 'flex';
    this.panel.classList.add('lifted');

    try {
      sfx.playKey('modal-open');
    } catch {}

    const dialog =
      this.unlockPanel.querySelector('.unlock-card') ||
      this.unlockPanel.firstElementChild;
    dialog?.addEventListener('click', (e) => e.stopPropagation(), {
      once: true,
    });

    this.unlockPanel.onclick = (e) => {
      if (e.target === this.unlockPanel) this.hideUnlock();
    };

    if (this.unlockClose) {
      this.unlockClose.textContent = 'X';
      this.unlockClose.setAttribute('aria-label', 'X');
      this.unlockClose.title = 'X';
      this.unlockClose.onclick = () => this.hideUnlock();
    }
    if (this.unlockBtn) this.unlockBtn.onclick = () => this.confirmUnlock();
  }
  private hideUnlock() {
    if (!this.unlockPanel) return;
    try {
      sfx.playKey('modal-close');
    } catch {}
    this.unlockPanel.style.display = 'none';
    this.panel.classList.remove('lifted');
    this.unlockPanel.onclick = null as any;
  }
  private confirmUnlock() {
    if (!this.unlockBtn) return;
    const tierId = (this.unlockBtn as any).dataset.tier as string | undefined;
    if (!tierId) return;
    if (unlockTier(tierId)) {
      const tokensEl = document.getElementById(
        'tokens'
      ) as HTMLSpanElement | null;
      if (tokensEl) tokensEl.textContent = String(state.tokens);
      this.hideUnlock();
      this.render();
      const t = getTiers().find((tt) => tt.id === tierId);
      if (t) toast(`Unlocked “${t.name}”`, 'success');
    } else {
      const t = getTiers().find((tt) => tt.id === tierId);
      if (t) this.openUnlock(t.id, t.name);
    }
  }
}

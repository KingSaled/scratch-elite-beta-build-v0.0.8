import { Container } from 'pixi.js';
import { sfx } from '../core/sfx.js';

function fmtMoney(n: number) {
  return `$${Math.max(0, Math.floor(n)).toLocaleString()}`;
}

/* ---------- Simple modal helpers for claimed tickets ---------- */
function openModal(title: string, bodyHTML: string, closeLabel = 'Close') {
  const modal = document.getElementById('modal') as HTMLDivElement | null;
  const t = document.getElementById('modalTitle');
  const b = document.getElementById('modalBody');
  const a = document.getElementById('modalActions');
  if (!modal || !t || !b || !a) return;

  t.textContent = title;
  b.innerHTML = bodyHTML;

  a.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'btn btn-danger btn-wide';
  btn.textContent = closeLabel;
  btn.onclick = () => closeModal();
  a.appendChild(btn);

  modal.classList.add('show');
}
function closeModal() {
  const modal = document.getElementById('modal') as HTMLDivElement | null;
  if (modal) modal.classList.remove('show');
}

/* ---------- Tiny image preloader so thumbs don’t “pop in” ---------- */
const _imgCache = new Map<string, Promise<void>>();
function preload(url: string): Promise<void> {
  if (!url) return Promise.resolve();
  if (_imgCache.has(url)) return _imgCache.get(url)!;

  const p = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    (img as any).loading = 'eager';
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });

  _imgCache.set(url, p);
  return p;
}

/* ===================================================================

   Inventory scene — DOM-driven grid, wrapped in a tiny Pixi container
   so the SceneManager can mount/unmount it like other scenes.

=================================================================== */
export class InventoryScene extends Container {
  private panel = document.getElementById('inventoryPanel') as HTMLDivElement;
  private grid = document.getElementById('invGrid') as HTMLDivElement;

  // Filters / sort
  private fPrice = document.getElementById('invFilterPrice') as HTMLSelectElement;
  private fSet = document.getElementById('invFilterSet') as HTMLSelectElement;
  private fSort = document.getElementById('invSort') as HTMLSelectElement;
  private fState = document.getElementById('invFilterState') as HTMLSelectElement; // sealed/scratched/claimed/all

  constructor() {
    super();
    this.bind();
  }

  onEnter() {
    this.panel.classList.add('show');
    // theme the dropdowns (avoids white-on-white menus)
    [this.fPrice, this.fSet, this.fSort, this.fState].forEach((s) =>
      s.classList.add('select-themed')
    );
    // Make sure the Set dropdown reflects whatever’s in TicketTiers.json right now
    this.refreshSetOptions().then(() => this.render());
  }

  onExit() {
    this.panel.classList.remove('show');
  }

  layout(_w: number, _h: number) {}

  private bind() {
    [this.fPrice, this.fSet, this.fSort, this.fState].forEach((sel) =>
      sel.addEventListener('change', () => this.render())
    );
  }

  /**
   * Rebuild the "Set" <select> from live tier data so JSON edits are reflected automatically.
   * Keeps the user's current selection if possible; otherwise falls back to "all".
   */
  private async refreshSetOptions() {
    const contentMod = await import('../data/content.js');

    let sets: string[] = [];
    if (typeof (contentMod as any).getSets === 'function') {
      sets = (contentMod as any).getSets();
    } else if (typeof (contentMod as any).getTiers === 'function') {
      const tiers = (contentMod as any).getTiers() as Array<{ set?: string }>;
      const seen = new Set<string>();
      for (const t of tiers) {
        const s = (t.set || '').trim();
        if (s && !seen.has(s)) {
          seen.add(s);
          sets.push(s);
        }
      }
    }

    const prev = this.fSet.value || 'all';

    // Clear and rebuild: "All" + each set from data
    this.fSet.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'All Sets';
    this.fSet.appendChild(optAll);

    for (const s of sets) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      this.fSet.appendChild(opt);
    }

    // Restore selection if still valid, else default to "all"
    const hasPrev =
      prev === 'all' || Array.from(this.fSet.options).some((o) => o.value === prev);
    this.fSet.value = hasPrev ? prev : 'all';
  }

  private render = async () => {
    // Lazy-load to avoid circular import headaches in bundler mode
    const stateMod = await import('../core/state.js');
    const contentMod = await import('../data/content.js');
    const sessionMod = await import('../core/session.js');

    const state = stateMod.state as any;
    const getTierById = contentMod.getTierById as (id: string) => any;
    const setCurrentItem = sessionMod.setCurrentItem as (id: string | null) => void;

    const items = [...(state.inventory as any[])];

    // Sorting
    const sort = this.fSort.value;
    items.sort((a: any, b: any) => {
      if (sort === 'new') return b.createdAt - a.createdAt;
      if (sort === 'old') return a.createdAt - b.createdAt;
      const ta = getTierById(a.tierId), tb = getTierById(b.tierId);
      const pa = ta?.price ?? 0, pb = tb?.price ?? 0;
      if (sort === 'priceAsc') return pa - pb;
      if (sort === 'priceDesc') return pb - pa;
      return 0;
    });

    // Filters
    const priceBand = this.fPrice.value;  // "all" | "1-5" | "101-1000" | "1000001+"
    const setFilter = this.fSet.value;    // "all" or live set name
    const stateFilter = this.fState.value;// sealed / scratched / claimed / all

    function inPrice(price: number): boolean {
      if (priceBand === 'all') return true;
      if (priceBand.endsWith('+')) {
        const min = Number(priceBand.replace('+', '')) || 0;
        return price >= min;
      }
      const [minStr, maxStr] = priceBand.split('-');
      const min = Number(minStr) || 0;
      const max = Number(maxStr) || Number.POSITIVE_INFINITY;
      return price >= min && price <= max;
    }

    this.grid.innerHTML = '';

    for (const it of items) {
      const tier = getTierById(it.tierId);
      if (!tier) continue;

      if (!inPrice(tier.price)) continue;
      if (setFilter !== 'all' && tier.set !== setFilter) continue;
      if (stateFilter !== 'all' && it.state !== stateFilter) continue;

      const bgURL = tier?.visual?.bgImage || '';

      // --- card root
      const card = document.createElement('div');
      card.className = 'inv-card is-' + it.state;

      // --- tiny ticket thumb (BG image only) — CSS uses var(--bg)
      const thumb = document.createElement('div');
      thumb.className = 'inv-thumb';
      thumb.style.setProperty('--bg', bgURL ? `url("${bgURL}")` : 'linear-gradient(#0f1723,#0b1220)');

      // progressive loading
      if (bgURL) {
        card.classList.add('loading');
        preload(bgURL).then(() => {
          thumb.classList.add('loaded');
          card.classList.remove('loading');
        });
      }

      // title ribbon over thumb
      const title = document.createElement('div');
      title.className = 'inv-title';
      title.textContent = tier.name || 'Ticket';
      thumb.appendChild(title);

      // --- pills grid
      const pills = document.createElement('div');
      pills.className = 'inv-pills';

      const pillSerial = document.createElement('span');
      pillSerial.className = 'pill pill-serial';
      pillSerial.textContent = it.serialId;

      const pillState = document.createElement('span');
      pillState.className = `pill pill-state state-${it.state}`;
      pillState.textContent =
        it.state === 'sealed' ? 'Sealed' :
        it.state === 'scratched' ? 'Scratched' :
        'Claimed';

      const pillPrice = document.createElement('span');
      pillPrice.className = 'pill pill-price';
      pillPrice.textContent = fmtMoney(tier.price);

      pills.append(pillSerial, pillState, pillPrice);

      // Winner sash for claimed winners
      const claimSummary = it.ticket || {};
      const payout = Number.isFinite(claimSummary.payout) ? claimSummary.payout : 0;
      const isWinner = it.state === 'claimed' && payout > 0;

      if (isWinner) {
        const sash = document.createElement('div');
        sash.className = 'inv-sash win';
        sash.textContent = 'Winner!';
        card.appendChild(sash);
      } else if (it.state === 'claimed') {
        const badge = document.createElement('div');
        badge.className = 'inv-badge claimed';
        badge.textContent = 'CLAIMED';
        card.appendChild(badge);
      }

      // build
      card.append(thumb, pills);

      // === Route to Scratch (robust: tries SceneManager, then falls back to navbar click) ===
      card.addEventListener('click', async () => {
        if (it.state === 'claimed') {
          const summary = it.ticket || {};
          const price = Number(tier?.price ?? 0);
          const payout = Number((summary?.payout ?? 0) || 0);
          const net = payout - price;
          const winning = Array.isArray(summary?.winning) ? summary.winning : [];

          const body = `
            <div class="claimed-modal">
              <div class="kv-grid">
                <div class="kv-item"><div class="k">Ticket</div><div class="v">${tier?.name ?? it.tierId}</div></div>
                <div class="kv-item"><div class="k">Net</div><div class="v ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}$${Math.abs(net).toLocaleString()}</div></div>
                <div class="kv-item"><div class="k">Price</div><div class="v mono">$${price.toLocaleString()}</div></div>
                <div class="kv-item"><div class="k">Payout</div><div class="v mono">$${payout.toLocaleString()}</div></div>
                <div class="kv-item span-2">
                  <div class="k">Winning #s</div>
                  <div class="v">${
                    winning.length
                      ? `<div class="win-chips">${winning.map((n: number) => `<span class="chip">${n}</span>`).join('')}</div>`
                      : `<div class="muted">Winning numbers unavailable</div>`
                  }</div>
                </div>
              </div>
            </div>`;
          openModal('Claimed Ticket', body, 'Close');
          return;
        }

        // Sealed or scratched -> go scratch (play the tear)
        try { sfx.playKey('rip'); } catch {}

        setCurrentItem(it.id);
        try {
          const sm = await import('../core/sceneManager.js'); // keep .js for Vite ESM pathing
          (sm as any).goto?.('Scratch') ??
            document.querySelector<HTMLButtonElement>('.nav-btn[data-scene="Scratch"]')?.click();
        } catch {
          document.querySelector<HTMLButtonElement>('.nav-btn[data-scene="Scratch"]')?.click();
        }
      });

      // a11y: Enter/Space to open
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (card as HTMLDivElement).click();
        }
      });
      card.tabIndex = 0;

      this.grid.appendChild(card);
    }

    // Empty-state message
    if (!this.grid.children.length) {
      const empty = document.createElement('div');
      empty.className = 'inv-empty';
      empty.textContent = 'No tickets match your filters.';
      this.grid.appendChild(empty);
    }
  };
}

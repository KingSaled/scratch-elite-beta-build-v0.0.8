import { Container } from 'pixi.js';
import { sfx } from '../core/sfx.js';

function fmtMoney(n: number) {
  return `$${Math.max(0, Math.floor(n)).toLocaleString()}`;
}

// --- modal helpers for Inventory ---
function openModal(title: string, bodyHTML: string, closeLabel = 'Close') {
  const modal = document.getElementById('modal') as HTMLDivElement | null;
  const t = document.getElementById('modalTitle');
  const b = document.getElementById('modalBody');
  const a = document.getElementById('modalActions');
  if (!modal || !t || !b || !a) return;

  t.textContent = title;
  b.innerHTML = bodyHTML;

  // actions (full-width primary button)
  a.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'btn btn-danger btn-wide'; // keep your styling
  btn.textContent = closeLabel;
  btn.onclick = () => closeModal();
  a.appendChild(btn);

  modal.classList.add('show');
}
function closeModal() {
  const modal = document.getElementById('modal') as HTMLDivElement | null;
  if (modal) modal.classList.remove('show');
}

// tiny image preloader so thumbs don’t “pop in”
const _imgCache = new Map<string, Promise<void>>();
function preload(url: string): Promise<void> {
  if (!url) return Promise.resolve();
  if (_imgCache.has(url)) return _imgCache.get(url)!;
  const p = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = 'auto';
    (img as any).loading = 'eager';
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
  _imgCache.set(url, p);
  return p;
}

// Inventory scene: DOM-driven panel + tiny Pixi container so the SceneManager
// can add/remove it like other scenes.
export class InventoryScene extends Container {
  private panel = document.getElementById('inventoryPanel') as HTMLDivElement;
  private grid = document.getElementById('invGrid') as HTMLDivElement;

  // Filters / sort
  private fPrice = document.getElementById(
    'invFilterPrice'
  ) as HTMLSelectElement;
  private fSet = document.getElementById('invFilterSet') as HTMLSelectElement;
  private fSort = document.getElementById('invSort') as HTMLSelectElement;
  private fState = document.getElementById(
    'invFilterState'
  ) as HTMLSelectElement; // sealed/scratched/claimed/all

  // Delegation guard
  private _delegated = false;

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
    // Ensure the Set dropdown reflects whatever is in TicketTiers.json right now
    this.refreshSetOptions().then(() => this.render());
    this.wireGridDelegationOnce(); // make sure delegation is in place
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

    // Try helper if you added it; otherwise derive from tiers.
    let sets: string[] = [];
    if (typeof (contentMod as any).getSets === 'function') {
      sets = (contentMod as any).getSets();
    } else if (typeof (contentMod as any).getTiers === 'function') {
      const tiers = (contentMod as any).getTiers() as { set?: string }[];
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
      prev === 'all' ||
      Array.from(this.fSet.options).some((o) => o.value === prev);
    this.fSet.value = hasPrev ? prev : 'all';
  }

  // --- Robust delegated handlers so cards remain clickable after re-renders ---
  private wireGridDelegationOnce() {
    if (this._delegated) return;
    this._delegated = true;

    // Click → open ticket (or claimed summary)
    this.grid.addEventListener('click', async (ev) => {
      const target = ev.target as HTMLElement | null;
      const card = target?.closest?.('.inv-card') as HTMLElement | null;
      if (!card) return;

      const id = card.dataset.id!;
      const state = card.dataset.state || 'sealed';

      if (state === 'claimed') {
        // Build a summary modal from live data
        const contentMod = await import('../data/content.js');
        const stateMod = await import('../core/state.js');
        const it = (stateMod.state as any).inventory.find(
          (x: any) => x.id === id
        );
        if (!it) return;

        const tier = contentMod.getTierById(it.tierId);
        const price = Number(tier?.price ?? 0);
        const summary = it.ticket || {};
        const payout = Number((summary?.payout ?? 0) || 0);
        const net = payout - price;
        const winning = Array.isArray(summary?.winning) ? summary.winning : [];

        const body = `
          <div class="claimed-modal">
            <div class="kv-grid">
              <div class="kv-item"><div class="k">Ticket</div><div class="v">${
                tier?.name ?? it.tierId
              }</div></div>
              <div class="kv-item"><div class="k">Net</div><div class="v ${
                net >= 0 ? 'pos' : 'neg'
              }">${net >= 0 ? '+' : ''}$${Math.abs(
          net
        ).toLocaleString()}</div></div>
              <div class="kv-item"><div class="k">Price</div><div class="v mono">$${price.toLocaleString()}</div></div>
              <div class="kv-item"><div class="k">Payout</div><div class="v mono">$${payout.toLocaleString()}</div></div>
              <div class="kv-item span-2">
                <div class="k">Winning #s</div>
                <div class="v">
                  ${
                    winning.length
                      ? `<div class="win-chips">${winning
                          .map((n: number) => `<span class="chip">${n}</span>`)
                          .join('')}</div>`
                      : `<div class="muted">Winning numbers unavailable</div>`
                  }
                </div>
              </div>
            </div>
          </div>`;
        openModal('Claimed Ticket', body, 'Close');
        return;
      }

      // Sealed or scratched → go scratch
      try {
        sfx.playKey('rip');
      } catch {}
      const sessionMod = await import('../core/session.js');
      sessionMod.setCurrentItem(id);

      // Route via navbar button (no SceneManager import required)
      document
        .querySelector<HTMLButtonElement>('.nav-btn[data-scene="Scratch"]')
        ?.click();
    });

    // Keyboard a11y: Enter/Space opens the focused card
    this.grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target as HTMLElement | null;
      const card = el?.closest?.('.inv-card') as HTMLElement | null;
      if (!card) return;
      e.preventDefault();
      card.click();
    });
  }

  // -------- Render inventory grid (no per-card handlers; delegation handles clicks) --------
  private render = async () => {
    // Lazy-load to avoid circular import headaches in bundler mode
    const stateMod = await import('../core/state.js');
    const contentMod = await import('../data/content.js');

    const state = stateMod.state as any;
    const getTierById = contentMod.getTierById as (id: string) => any;

    const items = [...(state.inventory as any[])];

    // Sorting
    const sort = this.fSort.value;
    items.sort((a: any, b: any) => {
      if (sort === 'new') return b.createdAt - a.createdAt;
      if (sort === 'old') return a.createdAt - b.createdAt;
      const ta = getTierById(a.tierId),
        tb = getTierById(b.tierId);
      const pa = ta?.price ?? 0,
        pb = tb?.price ?? 0;
      if (sort === 'priceAsc') return pa - pb;
      if (sort === 'priceDesc') return pb - pa;
      return 0;
    });

    // Filters
    const priceBand = this.fPrice.value; // e.g. "all" | "1-5" | "101-1000" | "1000001+"
    const setFilter = this.fSet.value; // "all" or live set name
    const stateFilter = this.fState.value; // sealed / scratched / claimed / all

    function inPrice(price: number): boolean {
      const band = priceBand;
      if (band === 'all') return true;

      if (band.endsWith('+')) {
        const min = Number(band.replace('+', '')) || 0;
        return price >= min;
      }
      const [minStr, maxStr] = band.split('-');
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

      const coverURL: string = tier?.visual?.coverImage || '';
      const bgURL: string = coverURL || tier?.visual?.bgImage || '';

      // --- card root
      const card = document.createElement('div');
      card.className = `inv-card is-${it.state}`;
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      (card.style as any).pointerEvents = 'auto';

      // identity for delegated handler
      card.dataset.id = it.id;
      card.dataset.state = it.state;
      card.dataset.tier = it.tierId;

      // --- tiny ticket thumb (background shorthand with !important)
      const thumb = document.createElement('div');
      thumb.className = 'inv-thumb';
      thumb.style.setProperty(
        'background',
        'linear-gradient(#0f1723,#0b1220) center/cover no-repeat',
        'important'
      );

      if (bgURL) {
        // Set actual BG immediately to kick off fetch, keep gradient as fallback
        thumb.style.setProperty(
          'background',
          `url("${bgURL}") center/cover no-repeat, linear-gradient(#0f1723,#0b1220) center/cover no-repeat`,
          'important'
        );

        // Optional warm-up and re-assert (helps if external CSS tried to override)
        preload(bgURL).then(() => {
          thumb.style.setProperty(
            'background',
            `url("${bgURL}") center/cover no-repeat, linear-gradient(#0f1723,#0b1220) center/cover no-repeat`,
            'important'
          );
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

      // Serial (first row, full width)
      const pillSerial = document.createElement('span');
      pillSerial.className = 'pill pill-serial';
      pillSerial.textContent = it.serialId;

      // State (second row, left)
      const pillState = document.createElement('span');
      pillState.className = `pill pill-state state-${it.state}`;
      pillState.textContent =
        it.state === 'sealed'
          ? 'Sealed'
          : it.state === 'scratched'
          ? 'Scratched'
          : 'Claimed';

      // Price (second row, right)
      const pillPrice = document.createElement('span');
      pillPrice.className = 'pill pill-price';
      pillPrice.textContent = fmtMoney(tier.price);

      // append in the desired layout order
      pills.append(pillSerial, pillState, pillPrice);

      // --- Winner sash / badge for claimed tickets
      const claimSummary = it.ticket || {};
      const payout = Number.isFinite(claimSummary.payout)
        ? claimSummary.payout
        : 0;
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

      // assemble
      card.append(thumb, pills);
      this.grid.appendChild(card);
    }

    // Optional: empty-state
    if (!this.grid.children.length) {
      const empty = document.createElement('div');
      empty.className = 'inv-empty';
      empty.textContent = 'No tickets match your filters.';
      this.grid.appendChild(empty);
    }

    // Ensure delegated handlers are in place
    this.wireGridDelegationOnce();
  };
}

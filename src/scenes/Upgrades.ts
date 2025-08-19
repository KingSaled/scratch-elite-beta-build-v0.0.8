import { Container } from 'pixi.js';
import {
  getDefs,
  getLevel,
  nextCost,
  canBuy,
  buyUpgrade,
} from '../core/upgrades.js';
import type { UpgradeDef } from '../core/upgrades.js';
import { state } from '../core/state.js';

export class UpgradesScene extends Container {
  private panel = document.getElementById('upgradesPanel') as HTMLDivElement;
  private list = document.getElementById('upgList') as HTMLDivElement;

  onEnter() {
    this.panel.classList.add('show');
    this.render();
  }
  onExit() {
    this.panel.classList.remove('show');
  }
  layout() {}

  private unmetRequirements(def: UpgradeDef): boolean {
    if (!def.requires) return false;
    return Object.entries(def.requires).some(
      ([id, need]) => getLevel(id) < need
    );
  }
  private reqText(def: UpgradeDef): string | null {
    if (!def.requires) return null;
    const parts: string[] = [];
    for (const [id, need] of Object.entries(def.requires)) {
      const base = getDefs().find((d) => d.id === id);
      const have = getLevel(id);
      parts.push(`${base?.name ?? id} Lv ${need} (Current: ${have})`);
    }
    return parts.length ? `Requires ${parts.join(', ')}` : null;
  }

  private buildDesc(def: UpgradeDef, lvl: number): string {
    if (def.id === 'scratch_radius') {
      const current =
        lvl >= 3
          ? 'Full card'
          : lvl === 2
          ? '3×3 area'
          : lvl === 1
          ? 'Cross (5 tiles)'
          : 'Single tile';
      const nextName =
        lvl >= def.levelCap
          ? null
          : lvl === 0
          ? 'Cross (5 tiles)'
          : lvl === 1
          ? '3×3 area'
          : 'Full card';
      return `<div class="upg-desc-line">Tap reveal: <b>${current}</b>${
        nextName ? ` → Next: <b>${nextName}</b>` : ''
      }</div>`;
    }
    if (def.id === 'bulk_discount' || def.id === 'bulk_discount_pro') {
      const levels = def.effect?.ticketDiscountPct?.levels ?? [];
      const cur = levels[Math.min(lvl, levels.length) - 1] ?? 0;
      const nxt = levels[lvl] ?? null;
      return `<div class="upg-desc-line">Ticket cost discount: <b>${cur}%</b>${
        nxt != null ? ` → Next: <b>${nxt}%</b>` : ''
      }</div>`;
    }
    if (def.id === 'prize_mult' || def.id === 'prize_mult_pro') {
      const levels = def.effect?.prizeMultiplierPct?.levels ?? [];
      const cur = levels[Math.min(lvl, levels.length) - 1] ?? 0;
      const nxt = levels[lvl] ?? null;
      return `<div class="upg-desc-line">Payout bonus: <b>+${cur}%</b>${
        nxt != null ? ` → Next: <b>+${nxt}%</b>` : ''
      }</div>`;
    }
    if (def.id === 'scratch_radius_pro') {
      const levels = [2, 3]; // parallel count
      const cur = levels[Math.min(lvl, levels.length) - 1] ?? 1;
      const nxt = levels[lvl] ?? null;
      return `<div class="upg-desc-line">Parallel scratch: <b>${cur} tickets</b>${
        nxt ? ` → Next: <b>${nxt} tickets</b>` : ''
      }</div>
              <div class="upg-desc-note">Scratches multiple identical tickets side-by-side when available.</div>`;
    }
    return `<div class="upg-desc-line">${
      def.desc || 'Improves your gameplay.'
    }</div>`;
  }

  private render() {
    this.list.innerHTML = '';

    for (const def of getDefs()) {
      const lvl = getLevel(def.id);
      const cost = nextCost(def.id);

      // ---- card root (matches your CSS) ----
      const card = document.createElement('div');
      card.className = 'upg-card';
      if (this.unmetRequirements(def) && lvl === 0)
        card.classList.add('locked');

      // left: image well
      const imgWrap = document.createElement('div');
      imgWrap.className = 'upg-img';
      if (def.image) {
        const img = document.createElement('img');
        img.src = def.image;
        img.alt = def.name;
        img.loading = 'lazy';
        imgWrap.appendChild(img);
      }

      // right: body grid
      const body = document.createElement('div');
      body.className = 'upg-body';

      // header
      const head = document.createElement('div');
      head.className = 'upg-head';

      const nameEl = document.createElement('div');
      nameEl.className = 'name';
      nameEl.textContent = def.name;

      const pricePill = document.createElement('div');
      pricePill.className = 'upg-price' + (cost === null ? ' max' : '');
      pricePill.textContent =
        cost === null ? 'MAX' : `$${cost.toLocaleString()}`;

      head.append(nameEl, pricePill);

      // description box
      const desc = document.createElement('div');
      desc.className = 'upg-desc';
      desc.innerHTML = this.buildDesc(def, lvl);

      // step bar
      const steps = document.createElement('div');
      steps.className = 'upg-steps';
      steps.style.gridTemplateColumns = `repeat(${def.levelCap}, 1fr)`;
      for (let i = 1; i <= def.levelCap; i++) {
        const seg = document.createElement('div');
        seg.className = 'seg' + (i <= lvl ? ' on' : '');
        steps.appendChild(seg);
      }

      // requires (optional)
      const reqText = this.reqText(def);
      if (reqText) {
        const req = document.createElement('div');
        req.className = 'upg-requires';
        req.textContent = reqText;
        body.appendChild(req);
      }

      // actions row
      const actions = document.createElement('div');
      actions.className = 'upg-actions';

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `Level ${lvl}/${def.levelCap}`;

      const btn = document.createElement('button');
      btn.className = 'btn-cta';
      btn.textContent = cost === null ? 'Max' : 'Buy';
      btn.disabled = !(cost !== null && canBuy(def.id));
      btn.onclick = () => {
        if (buyUpgrade(def.id)) {
          const m = document.getElementById('money') as HTMLSpanElement | null;
          if (m) m.textContent = `$${state.money.toLocaleString()}`;
          this.render();
        }
      };

      actions.append(meta, btn);

      // compose right column
      body.append(head, desc, steps, actions);

      // assemble card
      card.append(imgWrap, body);
      this.list.appendChild(card);
    }
  }
}

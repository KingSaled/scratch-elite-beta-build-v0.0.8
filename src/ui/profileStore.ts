// src/ui/profileStore.ts
import { state, spendTokens, ownCosmetic, equipCosmetic } from '../core/state';
import { spendCash } from '../core/currency';
import { toast } from './alerts';
import * as profileData from '../data/profileStore.json';

type Cat =
  | 'background'
  | 'avatarBorder'
  | 'theme'
  | 'title'
  | 'pet'
  | 'petBorder';

interface Item {
  id: string;
  category: Cat;
  name: string;
  price?: { money?: number; tokens?: number };
  preview?: 'gradient' | 'border';
  css?: Record<string, string>;
  vars?: Record<string, string>;
  emoji?: string; // for pets
  bonus?: number; // for pets, e.g. 0.01
}

// JSON is { items: [...] } per profileStore.json you shared
const catalogItems: Item[] =
  (profileData as any).items ?? (profileData as any).default?.items ?? [];

// Helpers
function byCat(cat: Cat) {
  return catalogItems.filter((i) => i.category === cat);
}

function moneyLabel(n?: number) {
  return n && n > 0 ? `$${n.toLocaleString()}` : '';
}
function tokenLabel(n?: number) {
  return n && n > 0 ? `${n} token${n === 1 ? '' : 's'}` : '';
}

function ensureModal() {
  let modal = document.getElementById(
    'profileStoreModal'
  ) as HTMLDivElement | null;
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'profileStoreModal';
  modal.className = 'modal show';
  modal.innerHTML = `
    <div class="modal-backdrop" data-close="1"></div>
    <div class="modal-card profile-store">
      <div class="modal-title">Profile Store</div>
      <div class="store-tabs">
        ${(
          [
            'background',
            'avatarBorder',
            'theme',
            'title',
            'pet',
            'petBorder',
          ] as Cat[]
        )
          .map(
            (c) => `<button class="tab" data-tab="${c}">${tabName(c)}</button>`
          )
          .join('')}
      </div>
      <div class="store-grid" id="storeGrid"></div>
      <div class="modal-actions">
        <button class="btn" data-close="1">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('[data-close]')) closeProfileStore();
  });

  const tabs = modal.querySelectorAll<HTMLButtonElement>('.tab');
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      renderGrid(b.dataset.tab as Cat);
    });
    if (i === 0) b.classList.add('active');
  });

  renderGrid('background');
  return modal;
}

function tabName(c: Cat) {
  switch (c) {
    case 'background':
      return 'Backgrounds';
    case 'avatarBorder':
      return 'Avatar Borders';
    case 'theme':
      return 'Themes';
    case 'title':
      return 'Titles';
    case 'pet':
      return 'Pets';
    case 'petBorder':
      return 'Pet Borders';
  }
}

function renderGrid(cat: Cat) {
  const modal = document.getElementById('profileStoreModal')!;
  const grid = modal.querySelector('#storeGrid')!;
  grid.innerHTML = '';

  for (const it of byCat(cat)) {
    const owned = !!state.profile.cosmetics.owned[it.id];
    const equipped = state.profile.cosmetics.equipped[cat] === it.id;

    const card = document.createElement('div');
    card.className = 'store-card';

    // preview box
    const prev = document.createElement('div');
    prev.className = 'store-prev';
    if (it.category === 'background' && it.css?.backgroundImage) {
      prev.style.backgroundImage = it.css.backgroundImage;
      prev.style.backgroundSize = 'cover';
      prev.style.backgroundPosition = 'center';
    } else if (it.category === 'avatarBorder' || it.category === 'petBorder') {
      prev.style.boxShadow = it.css?.boxShadow || '0 0 0 2px #fff3';
      prev.style.background = '#0f1522';
    } else if (it.category === 'theme') {
      prev.style.background = it.vars?.['--accent'] || '#1f2937';
    } else if (it.category === 'pet') {
      prev.textContent = it.emoji || '⭐';
      prev.style.fontSize = '22px';
      prev.style.display = 'grid';
      prev.style.placeItems = 'center';
    }

    // title + price
    const title = document.createElement('div');
    title.className = 'store-name';
    title.textContent = it.name;

    const price = document.createElement('div');
    price.className = 'store-price';
    price.textContent = [
      moneyLabel(it.price?.money),
      tokenLabel(it.price?.tokens),
    ]
      .filter(Boolean)
      .join('  ·  ');

    const row = document.createElement('div');
    row.className = 'row';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';

    if (!owned) btn.textContent = 'Buy';
    else if (!equipped) btn.textContent = 'Equip';
    else btn.textContent = 'Equipped';

    btn.disabled = equipped;

    btn.addEventListener('click', () => {
      if (!state.profile.cosmetics.owned[it.id]) {
        const costMoney = Math.max(0, it.price?.money || 0);
        const costTok = Math.max(0, it.price?.tokens || 0);

        // pre-check funds to avoid partial spend
        if (costMoney > (state.money ?? 0)) {
          toast('Not enough money.', 'warn');
          return;
        }
        if (costTok > (state.tokens ?? 0)) {
          toast('Not enough tokens.', 'warn');
          return;
        }

        // spend now (safe due to pre-check)
        if (costMoney > 0 && !spendCash(costMoney)) {
          toast('Not enough money.', 'warn');
          return;
        }
        if (costTok > 0 && !spendTokens(costTok)) {
          toast('Not enough tokens.', 'warn');
          return;
        }

        ownCosmetic(it.id);
        toast('Purchased!', 'success');
      }

      equipCosmetic(it.category, it.id);
      applyEquippedToDOM();
      renderGrid(cat);
      toast('Equipped.', 'success');
    });

    row.appendChild(btn);
    card.append(prev, title, price, row);
    grid.appendChild(card);
  }
}

export function openProfileStore() {
  ensureModal();
  document.getElementById('profileStoreModal')?.classList.add('show');
}

export function closeProfileStore() {
  document.getElementById('profileStoreModal')?.remove();
}

// Apply equipped cosmetics to the Profile panel
export function applyEquippedToDOM() {
  const panel = document.getElementById(
    'profilePanel'
  ) as HTMLDivElement | null;
  if (!panel) return;

  // reset
  panel.style.backgroundImage = '';
  panel.style.removeProperty('--profile-title');

  // background
  const bgId = state.profile.cosmetics.equipped.background || null;
  if (bgId) {
    const it = catalogItems.find((x) => x.id === bgId);
    if (it?.css?.backgroundImage) {
      panel.style.backgroundImage = it.css.backgroundImage;
    }
  }

  // theme variables (scoped to profile panel)
  const themeId = state.profile.cosmetics.equipped.theme || null;
  if (themeId) {
    const it = catalogItems.find((x) => x.id === themeId);
    for (const [k, v] of Object.entries(it?.vars || {})) {
      panel.style.setProperty(k, String(v));
    }
  }

  // title (profile only)
  const titleId = state.profile.cosmetics.equipped.title || null;
  const titleEl = document.getElementById('profileTitle');
  if (titleEl) {
    titleEl.textContent = titleId
      ? catalogItems.find((x) => x.id === titleId)?.name || ''
      : '';
  }

  // avatar border
  const av = document.getElementById('profileAvatar') as HTMLDivElement | null;
  const avId = state.profile.cosmetics.equipped.avatarBorder || null;
  if (av) {
    av.style.boxShadow = '';
    if (avId) {
      const it = catalogItems.find((x) => x.id === avId);
      if (it?.css?.boxShadow) av.style.boxShadow = it.css.boxShadow;
    }
  }

  // pet border
  const petWrap = document.getElementById(
    'profilePetWrap'
  ) as HTMLDivElement | null;
  const petBorderId = state.profile.cosmetics.equipped.petBorder || null;
  if (petWrap) {
    petWrap.style.boxShadow = '';
    if (petBorderId) {
      const it = catalogItems.find((x) => x.id === petBorderId);
      if (it?.css?.boxShadow) petWrap.style.boxShadow = it.css.boxShadow;
    }
  }

  // pet render
  const petId = state.profile.cosmetics.equipped.pet || null;
  const petEl = document.getElementById('profilePet');
  const petBonusEl = document.getElementById('profilePetBonus');
  if (petEl) {
    const it = petId ? catalogItems.find((x) => x.id === petId) : null;
    petEl.textContent = it?.emoji || '';
    const bonus = it?.bonus ? Math.round(it.bonus * 100) : 0;
    if (petBonusEl)
      petBonusEl.textContent = bonus ? `+${bonus}% win bonus` : '';
  }
}

// keep DOM in sync when other tabs equip things
window.addEventListener('profile-cosmetics-changed', () =>
  applyEquippedToDOM()
);

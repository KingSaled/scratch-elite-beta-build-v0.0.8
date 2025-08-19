import { Container } from 'pixi.js';
import { state, setUsername, setAvatarUrl } from '../core/state.js';
import { openProfileStore, applyEquippedToDOM } from '../ui/profileStore.js';
import { toast } from '../ui/alerts.js';

const refreshHUD = () => (window as any).__REFRESH_HUD__?.();

function debounce<T extends any[]>(fn: (...a: T) => void, wait = 200) {
  let t = 0 as unknown as number;
  return (...a: T) => {
    clearTimeout(t);
    t = window.setTimeout(() => fn(...a), wait);
  };
}

function updateTopbarFromState() {
  // Username
  const nameEl = document.querySelector<HTMLElement>('.tb-name');
  if (nameEl) nameEl.textContent = state.profile?.username || 'Player';

  // Avatar (assume IMG; noop if it isn't)
  const av = document.querySelector<HTMLImageElement>('.tb-avatar');
  if (av && av.tagName === 'IMG') {
    const url = state.profile?.avatarUrl?.trim() || '';
    if (url && av.src !== url) av.src = url;
    if (!url) av.removeAttribute('src');
  }
}

function notifyProfileChanged() {
  updateTopbarFromState();
  try {
    window.dispatchEvent(new Event('profile-updated'));
    window.dispatchEvent(new Event('hud-refresh'));
  } catch {}
  refreshHUD();
}

export class ProfileScene extends Container {
  private panel = document.getElementById('profilePanel') as HTMLDivElement;

  onEnter() {
    this.panel.classList.add('show');
    this.render();
  }
  onExit() {
    this.panel.classList.remove('show');
  }
  layout() {}

  private render() {
    const p = state.profile || ({} as any);
    const uname = p.username || 'Player';
    const avatar = (p.avatarUrl || '').trim();

    this.panel.innerHTML = `
      <div class="section">
        <div class="row wrap" style="align-items:flex-start; gap:18px">
          <div id="profileAvatar" class="avatar"
               style="width:72px;height:72px;border-radius:14px;border:1px solid rgba(255,255,255,.12);
                      background:#0f1522;overflow:hidden;display:grid;place-items:center;">
            ${
              avatar
                ? `<img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:14px;">`
                : `<span style="opacity:.7">avatar</span>`
            }
          </div>
          

          <div style="min-width:280px;flex:1 1 320px;max-width:520px">
            <label class="label">Username</label>
            <input id="profileName" type="text" value="${uname}" />

            <label class="label" style="margin-top:16px">Avatar URL</label>
            <input id="profileAvatarUrl" type="text" placeholder="https://..." value="${avatar}" />

            <div class="row" style="margin-top:12px">
              <button id="btnProfileSave" class="btn btn-primary">Save</button>
              <button id="btnOpenStore" class="btn">Open Profile Store</button>
            </div>
          </div>
        </div>

        <div class="row" style="margin-top:16px; align-items:center; gap:12px">
          <div id="profileTitle" class="badge-pill"
               style="min-height:28px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.06);
                      border:1px solid rgba(255,255,255,.08);font-weight:900;"></div>
        </div>

        <div style="margin-top:18px">
          <div class="section-label">Pet</div>
          <div id="profilePetWrap"
               style="display:inline-flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;
                      border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04)">
            <div id="profilePet" style="font-size:26px;width:36px;text-align:center"></div>
            <div id="profilePetBonus" style="opacity:.9;font-weight:800"></div>
          </div>
        </div>
      </div>
      <!-- Under Construction banner -->
      <div style="margin-top:180px">
      <div class="uc-banner" role="note" aria-label="Under construction">
        <div class="uc-strip" aria-hidden="true"></div>
        <div class="uc-content">
          <span class="uc-emoji" aria-hidden="true">🚧</span>
          <strong>Under Construction</strong>
          <span class="uc-sub">This profile page is in active development. It functions but is very basic.</span>
        </div>
      </div>
    `;

    // Grab elements with correct types
const nameInput   = this.panel.querySelector('#profileName') as HTMLInputElement | null;
const avatarInput = this.panel.querySelector('#profileAvatarUrl') as HTMLInputElement | null;
const avatarBox   = this.panel.querySelector('#profileAvatar') as HTMLElement | null;

// Live username update (debounced)
const applyName = debounce(() => {
  const name = (nameInput?.value ?? '').trim();
  setUsername(name || 'Player');
  notifyProfileChanged();
}, 180);

nameInput?.addEventListener('input', applyName);
nameInput?.addEventListener('blur', () => {
  const name = (nameInput?.value ?? '').trim();
  setUsername(name || 'Player');
  notifyProfileChanged();
});

// Live avatar update (debounced) + preview
const applyAvatar = debounce(() => {
  const url = (avatarInput?.value ?? '').trim();
  setAvatarUrl(url);

  // preview without full re-render
  if (avatarBox) {
    if (url) {
      avatarBox.innerHTML =
        `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:14px;">`;
    } else {
      avatarBox.innerHTML = `<span style="opacity:.7">avatar</span>`;
    }
  }

  notifyProfileChanged();
}, 220);

avatarInput?.addEventListener('input', applyAvatar);
avatarInput?.addEventListener('blur', () => {
  const url = (avatarInput?.value ?? '').trim();
  setAvatarUrl(url);
  notifyProfileChanged();
});

// Save button (explicit commit)
(this.panel.querySelector('#btnProfileSave') as HTMLButtonElement | null)
  ?.addEventListener('click', () => {
    const name = (nameInput?.value ?? '').trim();
    const url  = (avatarInput?.value ?? '').trim();
    setUsername(name || 'Player');
    setAvatarUrl(url);
    notifyProfileChanged();
    toast('Profile saved.', 'success');
  });

// Store
(this.panel.querySelector('#btnOpenStore') as HTMLButtonElement | null)
  ?.addEventListener('click', () => {
    openProfileStore();
  });

// Render equipped cosmetics (background/theme/title/borders/pet)
applyEquippedToDOM();
  }
}

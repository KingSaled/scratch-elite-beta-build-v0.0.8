// src/ui/settings.ts
import { state, saveNow, replaceState, resetAndSave } from '../core/state';
import { exportStateText, parseImportedState } from '../core/storage';
import { addCash, spendCash } from '../core/currency';
import { getTiers } from '../data/content';
import { unlockTier } from '../core/state';
import { toast, confirmModal, promptModal } from './alerts';
import { sfx } from '../core/sfx';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
  document.querySelector<T>(sel)!;

const refreshHUD = () => (window as any).__REFRESH_HUD__?.();

function getBGM(): any {
  return (window as any).__BGM__ || null;
}

document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;

  // Make the settings panel and debug section reliably scrollable on small screens
  panel.style.overscrollBehavior = 'contain';

  /* -------- Preferences -------- */
  const autoReturn = $<HTMLInputElement>('#prefAutoReturn');
  autoReturn.checked = !!(state.flags as any)?.autoReturn;
  autoReturn.onchange = () => {
    state.flags = {
      ...(state.flags || {}),
      autoReturn: autoReturn.checked,
    } as any;
    saveNow();
  };

  /* -------- Performance -------- */
  const perfMode = $<HTMLInputElement>('#perfMode');
  perfMode.checked = !!(state.flags as any)?.performanceMode;
  perfMode.onchange = () => {
    state.flags = {
      ...(state.flags || {}),
      performanceMode: perfMode.checked,
    } as any;
    saveNow();
  };

  /* -------- Audio: MUSIC -------- */
  const musicMute = $<HTMLInputElement>('#musicMute');
  const musicVol = $<HTMLInputElement>('#musicVol');
  const musicPct = $<HTMLSpanElement>('#musicPct');

  try {
    if (localStorage.getItem('bgmVol') == null) {
      const bgm0 = getBGM();
      bgm0?.setVolume?.(0.05);
      localStorage.setItem('bgmVol', String(0.05));
    }
    const storedMute = localStorage.getItem('bgmMute');
    if (storedMute != null) getBGM()?.setMuted?.(JSON.parse(storedMute));
  } catch {}

  const syncMusicUI = () => {
    const bgm = getBGM();
    if (!bgm) return;
    const pct = bgm.getVolumePercent?.() ?? Math.round((bgm.volume ?? 0) * 100);
    musicMute.checked = !!bgm.muted;
    musicVol.value = String(pct);
    musicPct.textContent = `${pct}%`;
  };

  const bgm = getBGM();
  if (bgm) {
    syncMusicUI();
    bgm.events?.addEventListener?.('volumechange', syncMusicUI);
    bgm.events?.addEventListener?.('mutechange', syncMusicUI);
  } else {
    window.addEventListener('bgm-ready', syncMusicUI, { once: true });
  }

  musicVol.addEventListener('input', () => {
    const pct = Math.max(0, Math.min(100, Number(musicVol.value) || 0));
    musicPct.textContent = `${pct}%`;
    getBGM()?.setVolume?.(pct / 100);
    try {
      localStorage.setItem('bgmVol', String(pct / 100));
    } catch {}
  });

  musicMute.addEventListener('change', () => {
    const m = !!musicMute.checked;
    getBGM()?.setMuted?.(m);
    try {
      localStorage.setItem('bgmMute', JSON.stringify(m));
    } catch {}
  });

  /* -------- Audio: SFX -------- */
  const sfxMute = $<HTMLInputElement>('#sfxMute');
  const sfxVol = $<HTMLInputElement>('#sfxVol');
  const sfxPct = $<HTMLSpanElement>('#sfxPct');

  try {
    if (localStorage.getItem('sfxVol') == null) {
      sfx.setVolume(0.05);
      localStorage.setItem('sfxVol', String(0.05));
    }
    const storedMute = localStorage.getItem('sfxMute');
    if (storedMute != null) sfx.setMuted(JSON.parse(storedMute));
  } catch {}

  const syncSfxUI = () => {
    const pct = sfx.getVolumePercent();
    sfxMute.checked = sfx.isMuted();
    sfxVol.value = String(pct);
    sfxPct.textContent = `${pct}%`;
  };
  syncSfxUI();

  sfx.events.addEventListener('volumechange', syncSfxUI);
  sfx.events.addEventListener('mutechange', syncSfxUI);

  sfxVol.addEventListener('input', () => {
    const pct = Math.max(0, Math.min(100, Number(sfxVol.value) || 0));
    sfxPct.textContent = `${pct}%`;
    sfx.setVolume(pct / 100);
    try {
      localStorage.setItem('sfxVol', String(pct / 100));
    } catch {}
  });

  sfxMute.addEventListener('change', () => {
    const m = !!sfxMute.checked;
    sfx.setMuted(m);
    try {
      localStorage.setItem('sfxMute', JSON.stringify(m));
    } catch {}
  });

  /* -------- Profile -------- */
  const btnExport = $<HTMLButtonElement>('#btnExport');
  const fileImport = $<HTMLInputElement>('#fileImport');
  const btnReset = $<HTMLButtonElement>('#btnReset');

  // Make reset button red but NOT "danger", so it won't use cancel SFX
  btnReset.classList.remove('btn-danger');
  btnReset.classList.add('btn-reset');

  btnExport.addEventListener('click', () => {
    const name = (state.profile?.username || 'player')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase();
    const stamp = new Date()
      .toISOString()
      .replace(/[:]/g, '')
      .replace(/\.\d+Z$/, 'Z');
    const filename = `scratch_elite_${name}_${stamp}.json`;

    const txt = exportStateText(state);
    const blob = new Blob([txt], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Profile exported.', 'success');
  });

  fileImport.addEventListener('change', async () => {
    const f = fileImport.files?.[0];
    if (!f) return;
    try {
      if (!/\.json$/i.test(f.name)) throw new Error('Not a JSON file.');
      const text = await f.text();
      const next = parseImportedState(text);
      if (!next)
        throw new Error('File not recognized as a Scratch Elite profile.');
      replaceState(next as any);

      window.dispatchEvent(new Event('badges-baseline-now'));
      window.dispatchEvent(new Event('badges-scan-now'));

      toast('Profile imported.', 'success');
      refreshHUD();
    } catch (e: any) {
      toast(`Import failed: ${e?.message || e}`, 'error');
    } finally {
      fileImport.value = '';
    }
  });

  btnReset.addEventListener('click', async () => {
    const ok = await confirmModal(
      'Resetting Profile',
      'Are you sure?<br/><small>This will permanently delete your progress on this device.</small>',
      'Confirm',
      'Cancel',
      'danger'
    );
    if (ok) {
      await resetAndSave();
      toast('Profile reset.', 'success');
      location.reload();
    }
  });

  /* -------- Debug gate (emoji x5, pw=swag) -------- */
  const debugSection = $('#debugSection');
  const egg = $('#dbgEgg');

  // Ensure debug area can scroll even inside small viewports
  debugSection.style.maxHeight = '70vh';
  debugSection.style.overflow = 'auto';
  (debugSection.style as any).webkitOverflowScrolling = 'touch';

  let clicks = 0;
  let timeout: number | undefined;

  egg.addEventListener('click', async () => {
    clicks++;
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => (clicks = 0), 1200);

    if (clicks >= 5) {
      clicks = 0;
      const pw = await promptModal(
        'Developer Mode',
        'Enter password',
        '••••',
        'Confirm',
        'Cancel'
      );
      if (pw === 'swag') {
        debugSection.style.display = '';
        toast('Debug menu unlocked.', 'success');
        debugSection.scrollIntoView({ block: 'nearest' });
      } else if (pw != null) {
        toast('Incorrect password.', 'warn');
      }
    }
  });

  /* -------- Debug actions (buttons) -------- */
  panel.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement)?.closest('[data-debug]');
    if (!btn) return;

    const action = btn.getAttribute('data-debug');
    switch (action) {
      case 'add10000':
        addCash(10_000);
        refreshHUD();
        break;
      case 'add100000':
        addCash(100_000);
        refreshHUD();
        break;
      case 'spend1':
        spendCash(1);
        refreshHUD();
        break;
      case 'spend10':
        spendCash(10);
        refreshHUD();
        break;
      case 'spend100':
        spendCash(100);
        refreshHUD();
        break;
      case 'hardRefresh':
        location.reload();
        break;
    }
  });

  /* -------- Debug toggle: Unlock All Tiers -------- */
  const dbgToggle = document.getElementById(
    'dbgUnlockAll'
  ) as HTMLInputElement | null;
  if (dbgToggle) {
    dbgToggle.checked = !!(state.flags as any)?.debugUnlockAll;
    dbgToggle.addEventListener('change', () => {
      const enabled = dbgToggle.checked;
      state.flags = { ...(state.flags || {}), debugUnlockAll: enabled } as any;

      const w: any = window;
      const prev = !!w.__BADGES_SUPPRESS__;
      w.__BADGES_SUPPRESS__ = true;

      if (enabled) {
        for (const t of getTiers()) unlockTier(t.id);
        saveNow();
        toast('All tiers unlocked.', 'success');
      } else {
        saveNow();
      }

      window.dispatchEvent(new Event('badges-baseline-now'));
      w.__BADGES_SUPPRESS__ = prev;
    });
  }
});

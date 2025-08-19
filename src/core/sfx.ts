// src/core/sfx.ts
const K_VOL = 'sfxVol';
const K_MUTE = 'sfxMute';

function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}

function preferOgg(): boolean {
  const a = document.createElement('audio');
  return !!a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"') !== '';
}
function buildUrl(relBaseNoExt: string) {
  // Normalize: strip any leading slashes so we never resolve at domain root
  const clean = relBaseNoExt.replace(/^\/+/, '');

  // If the caller already supplied a relative path that starts with './' or '../',
  // keep it; otherwise make it explicitly relative to this module.
  const baseNoExt = /^(?:\.{1,2}\/)/.test(clean) ? clean : `./${clean}`;

  const ext = preferOgg() ? '.ogg' : '.mp3';
  return new URL(baseNoExt + ext, import.meta.url).href;
}

interface Voice { url: string; pool: HTMLAudioElement[]; i: number }

class SfxBus {
  private vol = load<number>(K_VOL, 0.05);
  private mute = load<boolean>(K_MUTE, false);
  readonly events = new EventTarget();
  private voices: Record<string, Voice> = {};

  register(key: string, relBaseNoExt: string, poolSize = 3) {
    const url = buildUrl(relBaseNoExt);
    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < poolSize; i++) {
      const a = new Audio(url);
      a.preload = 'auto';
      a.volume = this.mute ? 0 : this.vol;
      pool.push(a);
    }
    this.voices[key] = { url, pool, i: 0 };
  }

  playKey(key: string) {
    const v = this.voices[key];
    if (!v) return;
    const a = v.pool[v.i++ % v.pool.length];
    try {
      a.currentTime = 0;
      a.volume = this.mute ? 0 : this.vol;
      void a.play().catch(() => {}); // swallow NotSupported/blocked errors
    } catch {}
  }

  // Optional direct play by path base (without extension)
  playFile(relBaseNoExt: string) {
    try {
      const url = buildUrl(relBaseNoExt);
      const a = new Audio(url);
      a.volume = this.mute ? 0 : this.vol;
      void a.play().catch(() => {});
    } catch {}
  }

  /* ----- Volume / mute API ----- */
  getVolume() {
    return this.vol;
  }
  getVolumePercent() {
    return Math.round(this.vol * 100);
  }

  // both styles supported for callers
  isMuted() {
    return !!this.mute;
  }
  get muted() {
    return !!this.mute;
  }

  setVolume(v: number) {
    this.vol = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(K_VOL, JSON.stringify(this.vol));
    } catch {}
    this.events.dispatchEvent(new Event('volumechange'));
    for (const k in this.voices)
      for (const a of this.voices[k].pool) a.volume = this.mute ? 0 : this.vol;
  }
  setMuted(m: boolean) {
    this.mute = !!m;
    try {
      localStorage.setItem(K_MUTE, JSON.stringify(this.mute));
    } catch {}
    this.events.dispatchEvent(new Event('mutechange'));
    for (const k in this.voices)
      for (const a of this.voices[k].pool) a.volume = this.mute ? 0 : this.vol;
  }
}

export const sfx = new SfxBus();

/* ---- Registered keys (ensure files exist under src/sfx/) ---- */
sfx.register('nav', '../sfx/ui-nav', 3);
sfx.register('btn', '../sfx/btn', 3);
sfx.register('cancel', '../sfx/cancel', 2);
sfx.register('toggle', '../sfx/toggle', 2);
sfx.register('slide', '../sfx/slide', 2);

sfx.register('modal-open', '../sfx/modal-open', 1);
sfx.register('modal-close', '../sfx/modal-close', 1);

sfx.register('rip', '../sfx/rip', 3);
sfx.register('win', '../sfx/win', 2);

sfx.register('token', '../sfx/token', 2);
sfx.register('levelup', '../sfx/levelup', 1);
sfx.register('unlock', '../sfx/unlock', 1);
sfx.register('badge', '../sfx/badge', 1);

// src/core/sfx.ts

const K_VOL = 'sfxVol';
const K_MUTE = 'sfxMute';

// All SFX live in /public/sfx/*.ogg (and optionally *.mp3)
const SFX_BASE = `${import.meta.env.BASE_URL}sfx/`;

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

function buildUrl(nameNoExt: string) {
  // nameNoExt is just "btn", "ui-nav", etc.
  const clean = nameNoExt.replace(/^\/+/, ''); // guard against leading '/'
  const ext = preferOgg() ? 'ogg' : 'mp3';
  return `${SFX_BASE}${clean}.${ext}`;
}

interface Voice { url: string; pool: HTMLAudioElement[]; i: number }

class SfxBus {
  private vol = load<number>(K_VOL, 0.05);
  private mute = load<boolean>(K_MUTE, false);
  readonly events = new EventTarget();
  private voices: Record<string, Voice> = {};

  register(key: string, nameNoExt: string, poolSize = 3) {
    const url = buildUrl(nameNoExt);
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
      void a.play().catch(() => {}); // ignore autoplay/capability errors
    } catch {}
  }

  // Optional: play by file name (without extension)
  playFile(nameNoExt: string) {
    try {
      const url = buildUrl(nameNoExt);
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

/* ---- Registered keys (files must exist in public/sfx/) ---- */
sfx.register('nav', 'ui-nav', 3);
sfx.register('btn', 'btn', 3);
sfx.register('cancel', 'cancel', 2);
sfx.register('toggle', 'toggle', 2);

sfx.register('rip', 'rip', 3);
sfx.register('win', 'win', 2);

sfx.register('token', 'token', 2);
sfx.register('levelup', 'levelup', 1);
sfx.register('unlock', 'unlock', 1);
sfx.register('badge', 'badge', 1);


// src/core/bgm.ts
// Lightweight background-music manager with shuffle+loop and tiny crossfades.

interface Track {
  url: string;
}

const STORAGE_VOL = 'bgmVol';
const STORAGE_MUTE = 'bgmMute';
const INITIAL_VOL = 0.05; // <- default start volume (25%)

function loadPref<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    if (v == null) return fallback;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}
function savePref(k: string, v: any) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function fisherYates<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Bgm {
  private a = new Audio();
  private b = new Audio();
  private active: HTMLAudioElement = this.a;
  private nextEl: HTMLAudioElement = this.b;

  private queue: Track[] = [];
  private idx = 0;

  private fadeMs = 900; // crossfade duration
  private started = false; // blocked until first user gesture (autoplay policy)

  /** public state */
  volume = loadPref<number>(STORAGE_VOL, INITIAL_VOL);
  muted = loadPref<boolean>(STORAGE_MUTE, false);

  /** simple event hub for UI: 'volumechange' | 'mutechange' */
  readonly events = new EventTarget();

  constructor(tracks: Track[]) {
    this.setPlaylist(tracks);

    for (const el of [this.a, this.b]) {
      el.preload = 'auto';
      el.loop = false;
      el.crossOrigin = 'anonymous';
      el.volume = this.muted ? 0 : this.volume; // respect saved or default 25%
    }

    this.active.addEventListener('ended', () => this.next());
    this.nextEl.addEventListener('ended', () => this.next());

    // Pause when tab hidden; resume when visible (optional)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else if (this.started && !this.muted) this.resume().catch(() => {});
    });
  }

  setPlaylist(tracks: Track[]) {
    // Shuffle a fresh ring every time we cycle.
    this.queue = fisherYates(tracks);
    this.idx = 0;
  }

  private pick(idx = this.idx): Track {
    if (this.queue.length === 0) throw new Error('BGM playlist is empty');
    return this.queue[idx % this.queue.length];
  }

  /** Must be called after a user gesture (click/tap/keydown). */
  async start() {
    if (this.started) return;
    this.started = true;

    // Always start the first heard track from the beginning, at current volume.
    this.active.currentTime = 0;
    this.active.volume = this.muted ? 0 : this.volume;

    await this.playCurrent();
  }

  private async playCurrent() {
    const t = this.pick();
    this.active.src = t.url;
    this.active.volume = this.muted ? 0 : this.volume;
    if (this.started) {
      try {
        await this.active.play();
      } catch {
        /* autoplay still blocked */
      }
    }
  }

  async next() {
    // prepare the other element with the next track, then crossfade
    this.idx = (this.idx + 1) % this.queue.length;
    if (this.idx === 0) this.queue = fisherYates(this.queue); // reshuffle on wrap

    const upcoming = this.pick();
    this.nextEl.src = upcoming.url;

    // kick off upcoming quietly
    this.nextEl.volume = 0;
    try {
      await this.nextEl.play();
    } catch {}

    // crossfade to the target volume (respects mute & user volume)
    const start = performance.now();
    const from = this.active;
    const to = this.nextEl;
    const targetVol = this.muted ? 0 : this.volume;

    return new Promise<void>((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / this.fadeMs);
        from.volume = (1 - t) * targetVol;
        to.volume = t * targetVol;
        if (t < 1) requestAnimationFrame(step);
        else {
          try {
            from.pause();
          } catch {}
          // swap roles
          this.active = to;
          this.nextEl = from;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  async resume() {
    // ensure we respect current volume/mute on resume
    this.active.volume = this.muted ? 0 : this.volume;
    try {
      await this.active.play();
    } catch {}
  }

  pause() {
    try {
      this.active.pause();
    } catch {}
  }

  setVolume(v: number) {
    this.volume = clamp01(v);
    savePref(STORAGE_VOL, this.volume);

    // apply to both elements so changes feel immediate regardless of which is active
    const vol = this.muted ? 0 : this.volume;
    this.active.volume = vol;
    this.nextEl.volume = Math.min(this.nextEl.volume, vol); // don't jump louder mid-fade

    this.events.dispatchEvent(new Event('volumechange'));
  }

  setMuted(m: boolean) {
    this.muted = m;
    savePref(STORAGE_MUTE, this.muted);

    const vol = this.muted ? 0 : this.volume;
    this.active.volume = vol;
    this.nextEl.volume = vol;

    this.events.dispatchEvent(new Event('mutechange'));
    this.events.dispatchEvent(new Event('volumechange')); // UI often listens only to one
  }

  /** helper for UI display */
  getVolumePercent(): number {
    return Math.round(this.volume * 100);
  }
}

/** Auto-discovers audio files in src/assets/audio/lofi via Vite glob. */
export function discoverLofi(): Track[] {
  const mods = import.meta.glob<string>('../assets/audio/lofi/*.{mp3,ogg}', {
    eager: true,
    query: '?url',
    import: 'default',
  });

  const bucket = new Map<string, string>();
  for (const [p, url] of Object.entries(mods)) {
    const base = p.split('/').pop()!;
    const name = base.replace(/\.(mp3|ogg)$/i, '');
    const isMp3 = /\.mp3$/i.test(base);
    const prev = bucket.get(name);
    if (!prev || isMp3) bucket.set(name, url); // url is string now
  }
  return [...bucket.values()].map((url) => ({ url }));
}

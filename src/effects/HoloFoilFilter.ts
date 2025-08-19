/* @ts-nocheck */
import {
  Container,
  Sprite,
  Graphics,
  Assets,
  BlurFilter,
  Ticker,
} from 'pixi.js';

interface HoloOpts {
  alpha?: number;
  radius?: number;

  bloom?: boolean;
  bloomStrength?: number;
  bloomLevels?: number;

  sweep?: boolean;
  sweepWidth?: number; // px
  sweepSpeed?: number; // px/sec
  sweepInterval?: number; // sec between passes
  sweepAlpha?: number; // 0..1
  sweepTiltDeg?: number;

  edgeGlow?: boolean;
  edgeGlowColor?: number;
  edgeGlowStrength?: number;
  edgeGlowSpeed?: number; // cycles/sec
}

export default class HoloFoilFilter {
  url: string;
  alpha: number;
  radius: number;

  bloom: boolean;
  bloomStrength: number;
  bloomLevels: number;

  sweep: boolean;
  sweepWidth: number;
  sweepSpeed: number;
  sweepInterval: number;
  sweepAlpha: number;
  sweepTiltDeg: number;

  edgeGlow: boolean;
  edgeGlowColor: number;
  edgeGlowStrength: number;
  edgeGlowSpeed: number;

  sprite: any;
  mask: any;
  private _children: any[] = [];
  private _tickerFn?: (d: number) => void;
  private _rafId: number | null = null;
  private _t = 0;

  private _sweepG?: any;
  private _sweepCooldown = 0;
  private _sweepActive = false;
  private _edge?: any;

  constructor(url: string, opts: HoloOpts = {}) {
    this.url = url || '';
    this.alpha = opts.alpha ?? 0.28;
    this.radius = opts.radius ?? 20;

    this.bloom = !!opts.bloom;
    this.bloomStrength = opts.bloomStrength ?? 1.2;
    this.bloomLevels = Math.max(0, Math.floor(opts.bloomLevels ?? 1));

    this.sweep = opts.sweep ?? true;
    this.sweepWidth = Math.max(40, Math.floor(opts.sweepWidth ?? 160));
    this.sweepSpeed = opts.sweepSpeed ?? 48;
    this.sweepInterval = opts.sweepInterval ?? 8.0;
    this.sweepAlpha = opts.sweepAlpha ?? 0.22;
    this.sweepTiltDeg = opts.sweepTiltDeg ?? -16;

    this.edgeGlow = opts.edgeGlow ?? true;
    this.edgeGlowColor = opts.edgeGlowColor ?? 0xffffff;
    this.edgeGlowStrength = opts.edgeGlowStrength ?? 0.35;
    this.edgeGlowSpeed = opts.edgeGlowSpeed ?? 0.6;

    this.sprite = null;
    this.mask = null;
  }

  async install(target: any, width: number, height: number): Promise<any> {
    if (!this.url) return null;
    const tex = await Assets.load(this.url);

    const root = new Container();
    (root).eventMode = 'none';

    // Bloom layers behind main
    if (this.bloom && this.bloomLevels > 0) {
      for (let i = 0; i < this.bloomLevels; i++) {
        const b = new Sprite(tex);
        b.width = Math.round(width);
        b.height = Math.round(height);
        b.alpha = (this.alpha * 0.5) / this.bloomLevels;
        (b).eventMode = 'none';
        const blur = new BlurFilter();
        blur.quality = 1;
        blur.strength = (i + 1) * 6 * (this.bloomStrength ?? 1);
        b.filters = [blur];
        root.addChild(b);
        this._children.push(b);
      }
    }

    // Main overlay
    const spr = new Sprite(tex);
    spr.width = Math.round(width);
    spr.height = Math.round(height);
    spr.alpha = this.alpha;
    (spr).eventMode = 'none';
    root.addChild(spr);
    this._children.push(spr);

    // Rounded mask
    const mask = new Graphics()
      .roundRect(0, 0, Math.round(width), Math.round(height), this.radius)
      .fill(0xffffff);

    target.addChild(root, mask);
    (root).mask = mask;

    // Edge glow pulse
    if (this.edgeGlow) {
      const e = new Graphics()
        .roundRect(0, 0, Math.round(width), Math.round(height), this.radius)
        .stroke({ color: this.edgeGlowColor, width: 3, alpha: 0.0 });
      (e).eventMode = 'none';
      root.addChild(e);
      this._edge = e;
    }

    // Light sweep (slanted blurred bar)
    if (this.sweep) {
      const barH = Math.round(height * 1.2);
      const g = new Graphics().rect(0, 0, this.sweepWidth, barH).fill(0xffffff);
      (g).eventMode = 'none';
      g.alpha = 0.0;
      g.pivot.set(this.sweepWidth / 2, Math.round(barH * 0.5));
      g.rotation = (this.sweepTiltDeg * Math.PI) / 180;
      const blur = new BlurFilter();
      blur.quality = 1;
      blur.strength = 8;
      (g).filters = [blur];
      root.addChild(g);
      this._sweepG = g;
      this._sweepCooldown = 0; // show one immediately
    }

    // IMPORTANT: assign sprite BEFORE starting loops
    this.sprite = root;
    this.mask = mask;

    // Ticker + RAF fallback (both)
    this._tickerFn = (delta: number) => this._tick(delta / 60, width, height);
    Ticker.shared.add(this._tickerFn);
    Ticker.shared.start();

    const rafLoop = () => {
      // always schedule next frame; _tick is cheap
      this._tick(1 / 60, width, height);
      this._rafId = requestAnimationFrame(rafLoop as any);
    };
    this._rafId = requestAnimationFrame(rafLoop as any);

    return root;
  }

  private _tick(dt: number, width: number, height: number) {
    this._t += dt;

    // Edge glow pulse
    if (this._edge) {
      const a =
        (Math.sin(this._t * Math.PI * 2 * this.edgeGlowSpeed) + 1) * 0.5;
      this._edge.alpha = a * this.edgeGlowStrength;
    }

    // Light sweep lifecycle
    if (this._sweepG) {
      if (!this._sweepActive) {
        this._sweepCooldown -= dt;
        if (this._sweepCooldown <= 0) {
          this._sweepActive = true;
          this._sweepG.alpha = this.sweepAlpha;
          this._sweepG.x = -this.sweepWidth;
          this._sweepG.y = Math.round(height * 0.5);
        }
      } else {
        this._sweepG.x += this.sweepSpeed * dt;
        if (this._sweepG.x > width + this.sweepWidth) {
          this._sweepActive = false;
          this._sweepG.alpha = 0.0;
          this._sweepCooldown = this.sweepInterval;
        }
      }
    }
  }

  updateParallax(nx: number, ny: number, strength: number) {
    if (!this.sprite) return;
    this.sprite.x = Math.round(-nx * strength);
    this.sprite.y = Math.round(-ny * strength);
  }

  destroy() {
    if (this._tickerFn) Ticker.shared.remove(this._tickerFn);
    if (this._rafId != null) cancelAnimationFrame(this._rafId);
    try {
      this._children.forEach((c: any) => c.destroy?.());
    } catch {}
    try {
      this._sweepG?.destroy?.();
    } catch {}
    try {
      this._edge?.destroy?.();
    } catch {}
    try {
      this.sprite?.destroy?.();
    } catch {}
    try {
      this.mask?.destroy?.();
    } catch {}
    this._children = [];
    this._sweepG = undefined;
    this._edge = undefined;
    this.sprite = null;
    this.mask = null;
  }

  get uniforms() {
    return { uMouse: new Float32Array([0, 0]), uTime: 0 };
  }
}

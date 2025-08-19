import { A as Assets, C as Container, S as Sprite, B as BlurFilter, G as Graphics, T as Ticker } from "./index-BoJcktnZ.js";
class HoloFoilFilter {
  url;
  alpha;
  radius;
  bloom;
  bloomStrength;
  bloomLevels;
  sweep;
  sweepWidth;
  sweepSpeed;
  sweepInterval;
  sweepAlpha;
  sweepTiltDeg;
  edgeGlow;
  edgeGlowColor;
  edgeGlowStrength;
  edgeGlowSpeed;
  sprite;
  mask;
  _children = [];
  _tickerFn;
  _rafId = null;
  _t = 0;
  _sweepG;
  _sweepCooldown = 0;
  _sweepActive = false;
  _edge;
  constructor(url, opts = {}) {
    this.url = url || "";
    this.alpha = opts.alpha ?? 0.28;
    this.radius = opts.radius ?? 20;
    this.bloom = !!opts.bloom;
    this.bloomStrength = opts.bloomStrength ?? 1.2;
    this.bloomLevels = Math.max(0, Math.floor(opts.bloomLevels ?? 1));
    this.sweep = opts.sweep ?? true;
    this.sweepWidth = Math.max(40, Math.floor(opts.sweepWidth ?? 160));
    this.sweepSpeed = opts.sweepSpeed ?? 48;
    this.sweepInterval = opts.sweepInterval ?? 8;
    this.sweepAlpha = opts.sweepAlpha ?? 0.22;
    this.sweepTiltDeg = opts.sweepTiltDeg ?? -16;
    this.edgeGlow = opts.edgeGlow ?? true;
    this.edgeGlowColor = opts.edgeGlowColor ?? 16777215;
    this.edgeGlowStrength = opts.edgeGlowStrength ?? 0.35;
    this.edgeGlowSpeed = opts.edgeGlowSpeed ?? 0.6;
    this.sprite = null;
    this.mask = null;
  }
  async install(target, width, height) {
    if (!this.url) return null;
    const tex = await Assets.load(this.url);
    const root = new Container();
    root.eventMode = "none";
    if (this.bloom && this.bloomLevels > 0) {
      for (let i = 0; i < this.bloomLevels; i++) {
        const b = new Sprite(tex);
        b.width = Math.round(width);
        b.height = Math.round(height);
        b.alpha = this.alpha * 0.5 / this.bloomLevels;
        b.eventMode = "none";
        const blur = new BlurFilter();
        blur.quality = 1;
        blur.strength = (i + 1) * 6 * (this.bloomStrength ?? 1);
        b.filters = [blur];
        root.addChild(b);
        this._children.push(b);
      }
    }
    const spr = new Sprite(tex);
    spr.width = Math.round(width);
    spr.height = Math.round(height);
    spr.alpha = this.alpha;
    spr.eventMode = "none";
    root.addChild(spr);
    this._children.push(spr);
    const mask = new Graphics().roundRect(0, 0, Math.round(width), Math.round(height), this.radius).fill(16777215);
    target.addChild(root, mask);
    root.mask = mask;
    if (this.edgeGlow) {
      const e = new Graphics().roundRect(0, 0, Math.round(width), Math.round(height), this.radius).stroke({ color: this.edgeGlowColor, width: 3, alpha: 0 });
      e.eventMode = "none";
      root.addChild(e);
      this._edge = e;
    }
    if (this.sweep) {
      const barH = Math.round(height * 1.2);
      const g = new Graphics().rect(0, 0, this.sweepWidth, barH).fill(16777215);
      g.eventMode = "none";
      g.alpha = 0;
      g.pivot.set(this.sweepWidth / 2, Math.round(barH * 0.5));
      g.rotation = this.sweepTiltDeg * Math.PI / 180;
      const blur = new BlurFilter();
      blur.quality = 1;
      blur.strength = 8;
      g.filters = [blur];
      root.addChild(g);
      this._sweepG = g;
      this._sweepCooldown = 0;
    }
    this.sprite = root;
    this.mask = mask;
    this._tickerFn = (delta) => this._tick(delta / 60, width, height);
    Ticker.shared.add(this._tickerFn);
    Ticker.shared.start();
    const rafLoop = () => {
      this._tick(1 / 60, width, height);
      this._rafId = requestAnimationFrame(rafLoop);
    };
    this._rafId = requestAnimationFrame(rafLoop);
    return root;
  }
  _tick(dt, width, height) {
    this._t += dt;
    if (this._edge) {
      const a = (Math.sin(this._t * Math.PI * 2 * this.edgeGlowSpeed) + 1) * 0.5;
      this._edge.alpha = a * this.edgeGlowStrength;
    }
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
          this._sweepG.alpha = 0;
          this._sweepCooldown = this.sweepInterval;
        }
      }
    }
  }
  updateParallax(nx, ny, strength) {
    if (!this.sprite) return;
    this.sprite.x = Math.round(-nx * strength);
    this.sprite.y = Math.round(-ny * strength);
  }
  destroy() {
    if (this._tickerFn) Ticker.shared.remove(this._tickerFn);
    if (this._rafId != null) cancelAnimationFrame(this._rafId);
    try {
      this._children.forEach((c) => c.destroy?.());
    } catch {
    }
    try {
      this._sweepG?.destroy?.();
    } catch {
    }
    try {
      this._edge?.destroy?.();
    } catch {
    }
    try {
      this.sprite?.destroy?.();
    } catch {
    }
    try {
      this.mask?.destroy?.();
    } catch {
    }
    this._children = [];
    this._sweepG = void 0;
    this._edge = void 0;
    this.sprite = null;
    this.mask = null;
  }
  get uniforms() {
    return { uMouse: new Float32Array([0, 0]), uTime: 0 };
  }
}
export {
  HoloFoilFilter as default
};
//# sourceMappingURL=HoloFoilFilter-CNY5-NUj.js.map

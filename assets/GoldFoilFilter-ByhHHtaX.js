import { A as Assets, C as Container, S as Sprite, B as BlurFilter, G as Graphics, T as Ticker } from "./index-BoJcktnZ.js";
class GoldFoilFilter {
  url;
  alpha;
  radius;
  bloom;
  bloomStrength;
  bloomLevels;
  sparkles;
  sparkleRate;
  sparkleMin;
  sparkleMax;
  sparkleAlpha;
  sprite;
  mask;
  _children = [];
  _sparks = [];
  _tickerFn;
  _rafId = null;
  constructor(url, opts = {}) {
    this.url = url || "";
    this.alpha = opts.alpha ?? 0.26;
    this.radius = opts.radius ?? 20;
    this.bloom = !!opts.bloom;
    this.bloomStrength = opts.bloomStrength ?? 1.1;
    this.bloomLevels = Math.max(0, Math.floor(opts.bloomLevels ?? 1));
    this.sparkles = opts.sparkles ?? true;
    this.sparkleRate = Math.max(0, opts.sparkleRate ?? 0.1);
    this.sparkleMin = Math.max(2, Math.floor(opts.sparkleMin ?? 6));
    this.sparkleMax = Math.max(
      this.sparkleMin,
      Math.floor(opts.sparkleMax ?? 14)
    );
    this.sparkleAlpha = Math.min(1, Math.max(0, opts.sparkleAlpha ?? 0.18));
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
        blur.strength = (i + 1) * 5 * (this.bloomStrength ?? 1);
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
    this.sprite = root;
    this.mask = mask;
    this._tickerFn = (delta) => this._tick(delta / 60, width, height, root);
    Ticker.shared.add(this._tickerFn);
    Ticker.shared.start();
    const rafLoop = () => {
      this._tick(1 / 60, width, height, root);
      this._rafId = requestAnimationFrame(rafLoop);
    };
    this._rafId = requestAnimationFrame(rafLoop);
    return root;
  }
  _spawnSpark(width, height, parent) {
    const s = this.sparkleMin + Math.random() * (this.sparkleMax - this.sparkleMin);
    const g = new Graphics().circle(0, 0, s / 2).fill(16777215);
    g.eventMode = "none";
    g.x = Math.random() * width;
    g.y = Math.random() * height;
    g.alpha = 0;
    const blur = new BlurFilter();
    blur.quality = 1;
    blur.strength = s * 0.6;
    g.filters = [blur];
    parent.addChild(g);
    this._sparks.push({ g, t: 0, life: 1.4 + Math.random() * 0.8 });
  }
  _tick(dt, width, height, parent) {
    if (this.sparkles && Math.random() < this.sparkleRate * dt) {
      this._spawnSpark(width, height, parent);
    }
    const next = [];
    for (const sp of this._sparks) {
      sp.t += dt;
      const half = sp.life * 0.4;
      const a = sp.t < half ? sp.t / half * this.sparkleAlpha : Math.max(
        0,
        (1 - (sp.t - half) / (sp.life - half)) * this.sparkleAlpha
      );
      sp.g.alpha = a;
      if (sp.t >= sp.life) {
        try {
          sp.g.destroy?.();
        } catch {
        }
      } else {
        next.push(sp);
      }
    }
    this._sparks = next;
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
      this._sparks.forEach((s) => s.g?.destroy?.());
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
    this._sparks = [];
    this.sprite = null;
    this.mask = null;
  }
  get uniforms() {
    return { uMouse: new Float32Array([0, 0]), uTime: 0 };
  }
}
export {
  GoldFoilFilter as default
};
//# sourceMappingURL=GoldFoilFilter-ByhHHtaX.js.map

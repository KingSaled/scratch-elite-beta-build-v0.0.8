import { PlaceholderScene } from '../scenes/PlaceholderScene.js';
import { ScratchView } from '../scenes/ScratchView.js';
import { VendingMachine } from '../scenes/VendingMachine.js';
import { InventoryScene } from '../scenes/Inventory.js';
import { UpgradesScene } from '../scenes/Upgrades.js';
import { StatsScene } from '../scenes/Stats.js';
import { ProfileScene } from '../scenes/Profile.js';
import { initStreakHUD } from '../ui/streakHud.js';
import { initHeader } from '../ui/header.js';

export type SceneKey =
  | 'VendingMachine'
  | 'Inventory'
  | 'Scratch'
  | 'Upgrades'
  | 'Stats'
  | 'Profile'
  | 'Settings';

interface AppLike {
  canvas?: HTMLCanvasElement;
  renderer: {
    width: number;
    height: number;
    canvas?: HTMLCanvasElement;
  };
  stage: {
    addChild(child: any): void;
    removeChild(child: any): void;
    children?: any[];
  };
}

interface SceneBase {
  destroy?(opts?: any): void;
  onEnter?(): void;
  onExit?(): void;
  layout?(w: number, h: number): void; // CSS pixels
}

function getCssSize(app: AppLike): { w: number; h: number } {
  const canvas =
    (app as any).canvas ??
    (app.renderer as any).canvas ??
    (document.querySelector('#app canvas'));
  const w = canvas?.clientWidth ?? window.innerWidth;
  const h = canvas?.clientHeight ?? window.innerHeight;
  return { w, h };
}

let _mgr: SceneManager | null = null;
export function getManager(): SceneManager | null {
  return _mgr;
}
export function goto(key: SceneKey) {
  _mgr?.goto(key);
}
export function show(key: SceneKey) {
  _mgr?.goto(key);
}

export class SceneManager {
  private app: AppLike;
  private current: SceneBase | null = null;

  constructor(app: AppLike) {
    this.app = app;
    _mgr = this;
    initStreakHUD();
    initHeader();
  }

  goto(key: SceneKey) {
    // tear down previous scene
    try {
      this.current?.onExit?.();
    } catch {}
    if (this.current) {
      try {
        this.app.stage.removeChild(this.current as any);
      } catch {}
      try {
        this.current.destroy?.({ children: true });
      } catch {}
      this.current = null;
    }

    // build new scene
    let scene: SceneBase;
    switch (key) {
      case 'Scratch':
        scene = new ScratchView(this.app as any);
        break;
      case 'VendingMachine':
        scene = new VendingMachine();
        break;
      case 'Inventory':
        scene = new InventoryScene();
        break;
      case 'Upgrades':
        scene = new UpgradesScene();
        break;
      case 'Stats':
        scene = new StatsScene();
        break;
      case 'Profile':
        scene = new ProfileScene();
        break;
      default:
        scene = new PlaceholderScene(key);
    }

    this.current = scene;

    // may be a DOM-only scene; addChild can throw—ignore
    try {
      (this.app.stage.addChild as any)?.(scene as any);
    } catch {}

    try {
      scene.onEnter?.();
    } catch {}

    const { w, h } = getCssSize(this.app);
    try {
      scene.layout?.(w, h);
    } catch {}
  }

  layout(_w: number, _h: number) {
    const { w, h } = getCssSize(this.app);
    this.current?.layout?.(w, h);
  }
}

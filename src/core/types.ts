// Shared game types

export interface UnlockReq {
  vendorLevel: number;
  tokens: number;
  lifetimeWinnings: number;
}

export interface Mechanics {
  grid: [number, number];
  winningNumbers: number;
  hasBonusBox: boolean;
  multiplierChances: number[];
}

export interface TierVisual {
  bgKey: string;
  foil: 'none' | 'gold' | 'holo';
  holo: boolean;

  // optional visual customizations used by ScratchView
  accentHex?: string; // "#00ffcc"
  bgImage?: string; // URL to background art
  coverImage?: string; // URL to per-tile cover art
  font?: string; // CSS font-family or loaded font name
}

export interface TierDef {
  id: string;
  name: string;
  set: string;
  price: number;
  evTarget: number;
  unlock: UnlockReq;
  mechanics: Mechanics;
  visual: TierVisual;
}

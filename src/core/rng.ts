let _seed = 0;

function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _rand = mulberry32(1);

export function setSeed(seed: string | number) {
  if (typeof seed === 'number') _seed = seed >>> 0;
  else _seed = xmur3(String(seed))();
  _rand = mulberry32(_seed);
}
export function rng() {
  return _rand();
}
export function randInt(min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// NEW: local RNG for deterministic ticket generation
export function makeRng(seed: string | number) {
  const s = typeof seed === 'number' ? seed >>> 0 : xmur3(String(seed))();
  return mulberry32(s);
}

// default global seed
setSeed('dev');

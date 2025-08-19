import { state, saveNow } from './state.js';

export function addCash(amount: number) {
  if (!Number.isFinite(amount)) return;
  state.money = Math.max(0, state.money + Math.floor(amount));
  saveNow();
}
export function canSpend(amount: number) {
  return state.money >= Math.floor(amount);
}
export function spendCash(amount: number): boolean {
  const a = Math.floor(amount);
  if (a < 0) return false;
  if (!canSpend(a)) return false;
  state.money -= a;
  saveNow();
  return true;
}

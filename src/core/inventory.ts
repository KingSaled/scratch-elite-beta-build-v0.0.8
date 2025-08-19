import { state, saveNow } from './state.js';
import { makeInventoryId, makeSerial } from './ids.js';

export type InventoryState = 'sealed' | 'scratched' | 'claimed';

export interface InventoryItem {
  id: string; // inv_000123
  tierId: string; // e.g. t05
  serialId: string; // e.g. t05-000042
  createdAt: number; // unix seconds
  state: InventoryState; // sealed | scratched | claimed
}

export function addTickets(tierId: string, qty: number): InventoryItem[] {
  const items: InventoryItem[] = [];
  const ts = Math.floor(Date.now() / 1000);
  for (let i = 0; i < qty; i++) {
    const item: InventoryItem = {
      id: makeInventoryId(),
      tierId,
      serialId: makeSerial(tierId),
      createdAt: ts,
      state: 'sealed',
    };
    state.inventory.push(item);
    items.push(item);
  }
  saveNow();
  return items;
}

export function getInventory(): InventoryItem[] {
  return state.inventory as InventoryItem[];
}

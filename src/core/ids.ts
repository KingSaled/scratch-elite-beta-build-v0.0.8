// Tiny id + serial helpers for inventory items, etc.

// A monotonic counter we persist so ids/serials are stable across reloads.
let counter = Number(localStorage.getItem('__id_counter__') || '0');

function bumpCounter(): number {
  counter = (counter + 1) % 1_000_000;
  localStorage.setItem('__id_counter__', String(counter));
  return counter;
}

/** Base unique id fragment (time + counter) */
export function newId(): string {
  const seq = bumpCounter();
  const t = Date.now().toString(36);
  const c = seq.toString(36).padStart(4, '0');
  return `${t}${c}`;
}

/** What older code expects: returns something like "inv_kx12ab00f" */
export function makeInventoryId(): string {
  return `inv_${newId()}`;
}

/** Ticket-style serial like "t01-000123" */
export function makeSerial(tierId: string): string {
  const seq = bumpCounter();
  return `${tierId}-${String(seq).padStart(6, '0')}`;
}

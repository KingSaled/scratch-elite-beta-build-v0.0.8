let currentInvId: string | null = null;
export function setCurrentItem(id: string | null) {
  currentInvId = id;
}
export function getCurrentItem(): string | null {
  return currentInvId;
}

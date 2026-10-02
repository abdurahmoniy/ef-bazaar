import type { PopupTrigger } from './types';
interface PendingTrigger { trigger: PopupTrigger; userId: string; key: string; expiresAt: number; path?: string }
let pending: PendingTrigger | null = null;
const emitted = new Set<string>();
// Event keys identify a completed operation, never an old history record.
export function queuePopupTrigger(trigger: Exclude<PopupTrigger, 'BROWSE'>, userId: string, key: string, path?: string): void {
  const identity = `${userId}:${trigger}:${key}`;
  if (trigger === 'TRADE_COMPLETED' && emitted.has(identity)) return;
  if (trigger === 'TRADE_COMPLETED') emitted.add(identity);
  if (emitted.size > 200) emitted.delete(emitted.values().next().value!);
  pending = { trigger, userId, key, path, expiresAt: Date.now() + (trigger === 'TRADE_COMPLETED' ? 300_000 : 60_000) };
}
export function pendingPopupTrigger(userId: string, path: string): PopupTrigger {
  if (pending && (pending.userId !== userId || pending.expiresAt <= Date.now() || (pending.path && pending.path !== path))) pending = null;
  return pending?.trigger ?? 'BROWSE';
}
export function popupTriggerIdentity(userId: string, path: string): string {
  pendingPopupTrigger(userId, path);
  return pending ? `${pending.trigger}:${pending.key}:${pending.expiresAt}` : 'BROWSE';
}
export function clearPopupTrigger(userId?: string, key?: string): void {
  if (!userId || (pending?.userId === userId && pending.key === key)) pending = null;
}

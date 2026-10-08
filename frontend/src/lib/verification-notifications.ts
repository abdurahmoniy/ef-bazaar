import type { NotificationResponse } from './marketplace-types';
export const VERIFICATION_CODE_TTL = 5 * 60_000;
export function isVerificationNotification(n: NotificationResponse): boolean {
  return n.type === 'TRADE_LOGIN_CODE' || n.type === 'TRADE_EMAIL_CHANGE_CODE';
}
export function selectVerificationNotifications(items: NotificationResponse[], dismissed: Set<string>, now: number): NotificationResponse[] {
  const newest = new Map<string, NotificationResponse>();
  for (const n of items) {
    if (!isVerificationNotification(n) || !n.tradeId) continue;
    const timestamp = Date.parse(n.createdAt);
    if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > VERIFICATION_CODE_TTL) continue;
    const key = `${n.tradeId}:${n.type}`;
    const previous = newest.get(key);
    if (!previous || timestamp > Date.parse(previous.createdAt)) newest.set(key, n);
  }
  return [...newest.values()].filter(n => !n.readAt && !dismissed.has(n.id) && /^[0-9]{4,8}$/.test(n.verificationCode ?? ''))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

import type { MessageResponse } from './marketplace-types';
import { uzDayKey } from './chat-format';

export function canGroupMessages(
  previous: MessageResponse | undefined,
  current: MessageResponse | undefined,
  firstUnreadId?: string,
): boolean {
  if (!previous || !current || current.id === firstUnreadId) return false;
  if (previous.senderId !== current.senderId) return false;
  if (previous.messageType === 'TRADE_PROPOSAL' || current.messageType === 'TRADE_PROPOSAL') return false;
  if (uzDayKey(previous.createdAt) !== uzDayKey(current.createdAt)) return false;

  const elapsed = Date.parse(current.createdAt) - Date.parse(previous.createdAt);
  return elapsed >= 0 && elapsed <= 5 * 60 * 1000;
}

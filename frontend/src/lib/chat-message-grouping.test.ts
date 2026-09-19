import { describe, expect, it } from 'vitest';

import { canGroupMessages } from './chat-message-grouping';
import type { MessageResponse } from './marketplace-types';

const message = (id: string, overrides: Partial<MessageResponse> = {}): MessageResponse => ({
  id, chatId: 'chat', senderId: 'seller', content: 'Salom',
  createdAt: '2026-09-19T10:00:00Z', ...overrides,
});

describe('chat message groups', () => {
  it('joins consecutive messages from the same sender up to five minutes apart', () => {
    const first = message('one');
    expect(canGroupMessages(first, message('two', { createdAt: '2026-09-19T10:05:00Z' }))).toBe(true);
    expect(canGroupMessages(first, message('two', { createdAt: '2026-09-19T10:05:01Z' }))).toBe(false);
    expect(canGroupMessages(first, message('two', { senderId: 'buyer' }))).toBe(false);
    expect(canGroupMessages(undefined, first)).toBe(false);
    expect(canGroupMessages(first, undefined)).toBe(false);
  });

  it('separates the Uzbekistan midnight boundary even within five minutes', () => {
    expect(canGroupMessages(
      message('one', { createdAt: '2026-09-19T18:59:00Z' }),
      message('two', { createdAt: '2026-09-19T19:01:00Z' }),
    )).toBe(false);
  });

  it('does not group across the unread divider or a trade proposal', () => {
    const first = message('one');
    const unread = message('unread');
    expect(canGroupMessages(first, unread, unread.id)).toBe(false);
    expect(canGroupMessages(unread, message('three'), unread.id)).toBe(true);
    const proposal = message('proposal', { messageType: 'TRADE_PROPOSAL' });
    expect(canGroupMessages(first, proposal)).toBe(false);
    expect(canGroupMessages(proposal, message('three'))).toBe(false);
  });

  it('leaves invalid or out-of-order timestamps as separate messages', () => {
    expect(canGroupMessages(message('one'), message('two', { createdAt: '' }))).toBe(false);
    expect(canGroupMessages(message('one'), message('two', { createdAt: '2026-09-19T09:59:00Z' }))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { chronological, parsePage, partyName, partyOf } from './chat-admin';
import type { AdminChatResponse } from './chat-admin-types';
import type { MessageResponse } from './marketplace-types';

const chat: AdminChatResponse = {
  id: 'c1',
  listingId: 'l1',
  buyerId: 'buyer',
  sellerId: 'seller',
  buyerName: '@ali',
  sellerName: null,
  lastMessageAt: null,
  createdAt: '2026-09-14T10:00:00Z',
  messageCount: 2,
  lastMessagePreview: null,
};

function message(id: string, senderId: string): MessageResponse {
  return { id, chatId: 'c1', senderId, content: id, createdAt: '2026-09-14T10:00:00Z' };
}

describe('partyOf', () => {
  it('tells the two parties apart and leaves anyone else out', () => {
    expect(partyOf(chat, 'seller')).toBe('SELLER');
    expect(partyOf(chat, 'buyer')).toBe('BUYER');
    expect(partyOf(chat, 'someone')).toBeNull();
    expect(partyOf(chat, null)).toBeNull();
  });
});

describe('partyName', () => {
  it('uses the name when known and the role otherwise', () => {
    expect(partyName(chat, 'BUYER')).toBe('@ali');
    expect(partyName(chat, 'SELLER')).toBe('Sotuvchi');
  });
});

describe('chronological', () => {
  it('turns a newest-first page into reading order without touching the input', () => {
    const page = [message('newest', 'buyer'), message('oldest', 'seller')];
    expect(chronological(page).map((m) => m.id)).toEqual(['oldest', 'newest']);
    expect(page[0].id).toBe('newest');
  });
});

describe('parsePage', () => {
  it('accepts only non-negative integers', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage(undefined)).toBe(0);
    expect(parsePage('-1')).toBe(0);
    expect(parsePage('abc')).toBe(0);
  });
});

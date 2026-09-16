import { describe, expect, it } from 'vitest';

import { buildAdminChatTimeline, chronological, parsePage, partyName, partyOf } from './chat-admin';
import type { AdminChatListingEvent, AdminChatResponse } from './chat-admin-types';
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

// Listing selections belong to the message that preceded them, even across pages.
describe('buildAdminChatTimeline', () => {
  const selection = (id: string, afterMessageId: string | null, listingId = id): AdminChatListingEvent => ({
    id, listingId, requesterId: 'buyer', createdAt: '2026-09-14T10:00:01Z',
    afterMessageId, initial: afterMessageId === null, listing: null,
  });
  const ids = (items: ReturnType<typeof buildAdminChatTimeline>) => items.map((item) => `${item.type}:${item.id}`);

  it('places the first listing before messages and later listings after the relevant message', () => {
    const history = [selection('first', null), selection('second', 'm1'), selection('third', 'm2')];
    expect(ids(buildAdminChatTimeline([message('m3', 'buyer'), message('m2', 'seller'), message('m1', 'buyer')], history, true)))
      .toEqual(['listing:first', 'message:m1', 'listing:second', 'message:m2', 'listing:third', 'message:m3']);
  });

  it('retains repeated listings and multiple selections between two messages', () => {
    const history = [selection('start', null, 'a'), selection('next', 'm1', 'b'), selection('again', 'm1', 'a')];
    expect(ids(buildAdminChatTimeline([message('m2', 'buyer'), message('m1', 'buyer')], history, true)))
      .toEqual(['listing:start', 'message:m1', 'listing:next', 'listing:again', 'message:m2']);
  });

  it('does not lose or duplicate selections at message-page boundaries', () => {
    const history = [selection('first', null), selection('between-pages', 'older'), selection('last', 'newer')];
    const older = buildAdminChatTimeline([message('older', 'buyer')], history, true);
    const newer = buildAdminChatTimeline([message('newer', 'seller')], history, false);
    expect(ids([...older, ...newer])).toEqual(['listing:first', 'message:older', 'listing:between-pages', 'message:newer', 'listing:last']);
  });

  it('shows listing selections even before anyone sends a message', () => {
    expect(ids(buildAdminChatTimeline([], [selection('first', null), selection('second', null)], true)))
      .toEqual(['listing:first', 'listing:second']);
  });
});

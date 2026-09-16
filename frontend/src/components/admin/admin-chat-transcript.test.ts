// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminChatTranscript } from './admin-chat-transcript';
import type { AdminChatListingEvent, AdminChatResponse } from '@/lib/chat-admin-types';
import type { MessageResponse } from '@/lib/marketplace-types';

const chat: AdminChatResponse = {
  id: 'chat', listingId: 'latest', buyerId: 'buyer', sellerId: 'seller', buyerName: 'Ali', sellerName: '@vali',
  createdAt: '2026-09-16T04:00:00Z', lastMessageAt: null, messageCount: 2, lastMessagePreview: null,
};
const messages: MessageResponse[] = [
  { id: 'm2', chatId: 'chat', senderId: 'seller', content: 'Ikkinchi akkount bor', createdAt: '2026-09-16T04:03:00Z', replyToId: 'm1', replySenderId: 'buyer', replyPreview: 'Boshqa akkount bormi?' },
  { id: 'm1', chatId: 'chat', senderId: 'buyer', content: 'Boshqa akkount bormi?', createdAt: '2026-09-16T04:01:00Z' },
];
const selections: AdminChatListingEvent[] = [
  { id: 'first', listingId: 'original', requesterId: 'buyer', createdAt: chat.createdAt, afterMessageId: null, initial: true,
    listing: { description: 'Birinchi akkount', price: 25000, coverMessageId: 'photo-1', status: 'SOLD' } },
  { id: 'second', listingId: 'next', requesterId: 'seller', createdAt: '2026-09-16T04:02:00Z', afterMessageId: 'm1', initial: false,
    listing: { description: 'Ikkinchi akkount', price: 50000, coverMessageId: null, status: 'ACTIVE' } },
];
function render(listings = selections, pageMessages = messages, oldestPage = true) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(createElement(AdminChatTranscript, { chat, messages: pageMessages, listings, oldestPage }));
  return container;
}

describe('admin chat transcript', () => {
  it('shows the original listing and later selections between messages, keeping replies readable', () => {
    const view = render();
    const rows = Array.from(view.querySelector('ol')!.children);
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain('Suhbat boshlangan e’lon');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/marketplace/original');
    expect(rows[0].textContent).toContain('25 000');
    expect(rows[0].textContent).toContain('Sotilgan');
    expect(rows[0].querySelector('img')?.getAttribute('src')).toContain('photo-1');
    expect(rows[1].textContent).toContain('Boshqa akkount bormi?');
    expect(rows[2].textContent).toContain('@vali tanlagan e’lon');
    expect(rows[2].querySelector('a')?.getAttribute('href')).toBe('/marketplace/next');
    expect(rows[3].textContent).toContain('Ikkinchi akkount bor');
    expect(rows[3].textContent).toContain('Boshqa akkount bormi?');
    expect(view.querySelector('textarea, input, form')).toBeNull();
  });

  it('keeps deleted and missing listing cards without linking to an unavailable page', () => {
    const view = render([
      { ...selections[0], listing: { ...selections[0].listing!, status: 'DELETED' } },
      { ...selections[1], listing: null },
    ]);
    expect(view.textContent).toContain('O‘chirilgan');
    expect(view.textContent).toContain('E’lon ma’lumotlari mavjud emas');
    expect(view.querySelector('a')).toBeNull();
  });

  it('shows a listing in an empty conversation and keeps the empty-message prompt', () => {
    const view = render([selections[0]], []);
    expect(view.textContent).toContain('Birinchi akkount');
    expect(view.textContent).toContain("Bu chatda xabar yo'q.");
  });

  it('keeps the trade-offer outcome in its place after a listing change', () => {
    const view = render(selections, [{ ...messages[0], messageType: 'TRADE_PROPOSAL', proposalOutcome: 'ACCEPTED' }, messages[1]]);
    const rows = Array.from(view.querySelector('ol')!.children);
    expect(rows[2].textContent).toContain('Ikkinchi akkount');
    expect(rows[3].textContent).toContain('savdo taklifi — qabul qilingan');
  });
});

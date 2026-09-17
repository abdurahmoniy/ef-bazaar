import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './page';
import { getAdminChat, getAdminChatListingHistory, getAdminChatMessages } from '@/lib/chat-admin-server';

vi.mock('@/lib/chat-admin-server', () => ({
  getAdminChat: vi.fn(), getAdminChatListingHistory: vi.fn(), getAdminChatMessages: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getAdminChat).mockResolvedValue({ ok: true, data: {
    id: 'chat', listingId: 'listing', buyerId: 'buyer', sellerId: 'seller', buyerName: 'Ali', sellerName: 'Vali',
    createdAt: '2026-09-16T04:00:00Z', lastMessageAt: null, messageCount: 1, lastMessagePreview: null,
  } });
  vi.mocked(getAdminChatMessages).mockResolvedValue({ ok: true, data: {
    page: 0, size: 100, totalElements: 1, totalPages: 1,
    content: [{ id: 'm1', chatId: 'chat', senderId: 'buyer', content: 'Akkount hali sotuvdami?', createdAt: '2026-09-16T04:01:00Z' }],
  } });
});

describe('admin chat page', () => {
  it('fetches listing history and renders it before the first message', async () => {
    vi.mocked(getAdminChatListingHistory).mockResolvedValue({ ok: true, data: [{
      id: 'request', listingId: 'listing', requesterId: 'buyer', initial: false, afterMessageId: null,
      createdAt: '2026-09-16T04:00:00Z', listing: { description: 'Romario akkount', price: 25000, coverMessageId: null, status: 'ACTIVE' },
    }] });
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: 'chat' }) }));
    expect(getAdminChatListingHistory).toHaveBeenCalledWith('chat');
    expect(html.indexOf('Romario akkount')).toBeLessThan(html.indexOf('Akkount hali sotuvdami?'));
    expect(html).toContain('/marketplace/listing');
  });

  it('keeps messages readable when history cannot be loaded and reports that failure', async () => {
    vi.mocked(getAdminChatListingHistory).mockResolvedValue({ ok: false, error: {
      path: '/marketplace/v1/admin/chats/chat/listing-history', status: 503, message: 'Service unavailable',
    } });
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: 'chat' }) }));
    expect(html).toContain('Akkount hali sotuvdami?');
    expect(html).toContain('E’lonlar tarixi yuklanmadi');
  });
});

// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminSupportView } from './admin-support-view';
import type { AdminSupportChatSummary } from '@/lib/marketplace-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/marketplace-actions', () => ({
  adminGetSupportChat: vi.fn().mockResolvedValue({ ok: true, data: null }),
  adminReplySupportChat: vi.fn().mockResolvedValue({ ok: true }),
  adminCloseSupportChat: vi.fn().mockResolvedValue({ ok: true }),
}));

describe('AdminSupportView', () => {
  const mockChats: AdminSupportChatSummary[] = [
    {
      id: 'chat-1',
      category: 'SUPPORT',
      status: 'OPEN',
      userId: 'user-1',
      guestSessionId: null,
      senderName: 'Alisher Dev',
      senderContact: '+998901234567',
      telegramRootMessageId: 101,
      lastMessagePreview: 'Akkountimga kira olmayapman',
      lastMessageAt: '2026-09-09T12:00:00Z',
      createdAt: '2026-09-09T11:50:00Z',
    },
    {
      id: 'chat-2',
      category: 'PARTNERSHIP',
      status: 'REPLIED',
      userId: null,
      guestSessionId: 'guest-sess-99',
      senderName: 'Kanal Admini',
      senderContact: '@kanal_link',
      telegramRootMessageId: 102,
      lastMessagePreview: 'Hamkorlik taklifi',
      lastMessageAt: '2026-09-09T13:00:00Z',
      createdAt: '2026-09-09T12:30:00Z',
    },
  ];

  it('renders support chats list correctly', () => {
    const markup = renderToStaticMarkup(
      createElement(AdminSupportView, { chats: mockChats }),
    );

    expect(markup).toContain('Murojaatlar va Yordam chati');
    expect(markup).toContain('Alisher Dev');
    expect(markup).toContain('+998901234567');
    expect(markup).toContain('Akkountimga kira olmayapman');
    expect(markup).toContain('Kanal Admini');
    expect(markup).toContain('@kanal_link');
    expect(markup).toContain('(mehmon)');
    expect(markup).toContain('TG #101');
    expect(markup).toContain('TG #102');
  });

  it('renders status filter tabs and category filters', () => {
    const markup = renderToStaticMarkup(
      createElement(AdminSupportView, { chats: mockChats, activeStatus: 'OPEN' }),
    );

    expect(markup).toContain('Kutilmoqda');
    expect(markup).toContain('Javob berilgan');
    expect(markup).toContain('Yopilgan');
    expect(markup).toContain('Barchasi');

    expect(markup).toContain('Barcha mavzular');
    expect(markup).toContain('Texnik yordam');
    expect(markup).toContain('Hamkorlik');
    expect(markup).toContain('Umumiy savol');
  });

  it('renders empty state when no chats are present', () => {
    const markup = renderToStaticMarkup(
      createElement(AdminSupportView, { chats: [] }),
    );

    expect(markup).toContain('Murojaatlar topilmadi');
    expect(markup).toContain('Hozircha yangi murojaatlar yo‘q.');
  });
});

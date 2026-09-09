// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSupportChat,
  getActiveSupportChat,
  getOrCreateGuestSessionId,
  getSupportChat,
  sendSupportMessage,
  closeSupportChat,
  SUPPORT_CATEGORIES,
} from './support';

describe('support.ts', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('generates and persists guest session id in localStorage', () => {
    const id1 = getOrCreateGuestSessionId();
    expect(id1).toBeTruthy();
    const id2 = getOrCreateGuestSessionId();
    expect(id2).toBe(id1);
  });

  it('has valid labels for all support categories', () => {
    expect(SUPPORT_CATEGORIES.SUPPORT.label).toBe('Texnik yordam');
    expect(SUPPORT_CATEGORIES.PARTNERSHIP.label).toBe('Hamkorlik');
    expect(SUPPORT_CATEGORIES.QUESTION.label).toBe('Umumiy savol');
  });

  it('createSupportChat calls api and sends guestSessionId header', async () => {
    const mockChat = {
      id: 'chat-1',
      category: 'PARTNERSHIP',
      status: 'OPEN',
      senderName: 'Alisher',
      messages: [],
      lastMessageAt: '2026-09-09T12:00:00Z',
      createdAt: '2026-09-09T12:00:00Z',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockChat,
    } as any);

    const result = await createSupportChat({
      category: 'PARTNERSHIP',
      message: 'Hamkorlik qilamiz',
      senderName: 'Alisher',
      guestSessionId: 'sess-123',
    });

    expect(result).toEqual(mockChat);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/v1/support/chats'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Guest-Session-Id': 'sess-123',
        }),
      })
    );
  });

  it('getActiveSupportChat returns null on 204 No Content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 204,
      ok: true,
    } as any);

    const result = await getActiveSupportChat('sess-1');
    expect(result).toBeNull();
  });

  it('sendSupportMessage posts content and returns new message', async () => {
    const mockMsg = {
      id: 'msg-1',
      supportChatId: 'chat-1',
      senderType: 'USER',
      senderName: 'Alisher',
      content: 'Yana bir savol',
      createdAt: '2026-09-09T12:05:00Z',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockMsg,
    } as any);

    const result = await sendSupportMessage('chat-1', 'Yana bir savol', 'sess-1');
    expect(result).toEqual(mockMsg);
  });
});

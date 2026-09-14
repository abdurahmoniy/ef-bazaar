import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as route from './route';
import { getMe, telegramWebAppAuthTokens, applyAuthCookies } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  getMe: vi.fn(), telegramWebAppAuthTokens: vi.fn(), applyAuthCookies: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

describe('Telegram login session check', () => {
  it('returns only the verified session Telegram id without caching', async () => {
    vi.mocked(getMe).mockResolvedValue({ telegramId: 123, email: 'private@example.com' } as Awaited<ReturnType<typeof getMe>>);
    const response = await route.GET();
    expect(await response.json()).toEqual({ telegramId: 123 });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([null, new Error('Session validation failed')])('does not claim an authenticated user for %s', async (result) => {
    if (result instanceof Error) vi.mocked(getMe).mockRejectedValue(result);
    else vi.mocked(getMe).mockResolvedValue(result);
    expect(await (await route.GET()).json()).toEqual({ telegramId: null });
  });

  it('retains the native form login cookies and chat redirect', async () => {
    const auth = { accessToken: 'access', refreshToken: 'refresh', user: { telegramId: 123 } };
    vi.mocked(telegramWebAppAuthTokens).mockResolvedValue(auth as Awaited<ReturnType<typeof telegramWebAppAuthTokens>>);
    const response = await route.POST(new NextRequest('https://efbazaar.uz/api/telegram-webapp', {
      method: 'POST', body: new URLSearchParams({ initData: 'signed-data', from: '/chats/chat-123', framed: '0' }),
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/chats/chat-123');
    expect(applyAuthCookies).toHaveBeenCalledWith(response, auth, 'lax');
  });
});

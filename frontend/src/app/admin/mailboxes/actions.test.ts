import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiFetch: mocks.apiFetch };
});

import { ApiException } from '@/lib/api';
import { createMailboxAction } from './actions';

describe('createMailboxAction', () => {
  beforeEach(() => vi.resetAllMocks());

  it('sends the chosen domain', async () => {
    mocks.apiFetch.mockResolvedValue({ id: 'm1', email: 'promo1@efootball.uz' });

    const result = await createMailboxAction({ localPart: 'Promo1', ownerUserId: 'u1', domain: 'efootball.uz' });

    expect(result.ok).toBe(true);
    const [path, options] = mocks.apiFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(path).toBe('/trade/v1/admin/mailboxes');
    expect(options.body).toEqual({ localPart: 'promo1', ownerUserId: 'u1', domain: 'efootball.uz' });
  });

  it('leaves the domain to the server when none is chosen', async () => {
    mocks.apiFetch.mockResolvedValue({ id: 'm1', email: 'promo1@efbazaar.uz' });

    await createMailboxAction({ localPart: 'promo1', ownerUserId: 'u1' });

    const [, options] = mocks.apiFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(options.body).not.toHaveProperty('domain');
  });

  it('explains a refused domain', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiException({
      status: 400, error: 'Bad Request', message: 'x', code: 'domain_not_allowed',
    }));

    const result = await createMailboxAction({ localPart: 'promo1', ownerUserId: 'u1', domain: 'gmail.com' });

    expect(result).toMatchObject({ ok: false, error: 'Bu domen ruxsat etilmagan', code: 'domain_not_allowed' });
  });
});

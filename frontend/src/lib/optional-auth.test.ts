import { describe, expect, it } from 'vitest';

import { resolveOptionalUser } from './optional-auth';
import type { User } from './types';

const user: User = {
  id: 'user-1',
  telegramId: 123,
  telegramUsername: 'player',
  telegramFirstName: 'Player',
  telegramLastName: null,
  telegramPhotoUrl: null,
  displayName: 'Player',
  email: null,
  googleLinked: false,
  verified: false,
  roles: ['ROLE_USER'],
  createdAt: '2026-06-29T00:00:00Z',
};

describe('resolveOptionalUser', () => {
  it('returns the loaded user when auth lookup succeeds', async () => {
    await expect(resolveOptionalUser(async () => user)).resolves.toBe(user);
  });

  it('returns null when auth lookup throws', async () => {
    await expect(
      resolveOptionalUser(async () => {
        throw new TypeError('fetch failed');
      }),
    ).resolves.toBeNull();
  });
});

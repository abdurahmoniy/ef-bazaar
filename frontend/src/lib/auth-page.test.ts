import { describe, expect, it } from 'vitest';

import { resolveAuthPageUser } from './auth-page';
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
  telegramLinked: true, googleLinked: false,
  verified: false,
  roles: ['ROLE_USER'],
  createdAt: '2026-06-29T00:00:00Z',
};

describe('resolveAuthPageUser', () => {
  it('returns a real user so auth pages can redirect', async () => {
    await expect(resolveAuthPageUser(async () => user)).resolves.toBe(user);
  });

  it('treats failed session verification as anonymous', async () => {
    await expect(
      resolveAuthPageUser(async () => {
        throw new TypeError('fetch failed');
      }),
    ).resolves.toBeNull();
  });
});

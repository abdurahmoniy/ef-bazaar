import { describe, expect, it } from 'vitest';

import { adminUserActionConfig, adminUserBadges } from './admin-user-actions';
import type { User } from './types';

const baseUser = {
  id: 'u1',
  displayName: 'Ali',
  telegramUsername: null,
  telegramPhotoUrl: null,
  email: null,
  telegramLinked: false,
  googleLinked: false,
  roles: ['ROLE_USER'],
  verified: false,
  createdAt: '2026-08-08T00:00:00Z',
} satisfies User;

describe('admin user action helpers', () => {
  it('returns trade-admin grant action for a regular user', () => {
    expect(adminUserActionConfig(baseUser, 'toggle-trade-admin')).toMatchObject({
      role: 'TRADE_ADMIN',
      label: 'Inson admin qilish',
      confirmation: 'Ali inson admin qilinsinmi?',
    });
  });

  it('returns trade-admin revoke action for a trade admin', () => {
    const tradeAdmin = { ...baseUser, roles: ['ROLE_USER', 'ROLE_TRADE_ADMIN'] };

    expect(adminUserActionConfig(tradeAdmin, 'toggle-trade-admin')).toMatchObject({
      role: 'USER',
      label: 'Inson adminlikdan olish',
      confirmation: 'Ali inson adminlikdan olinsinmi?',
    });
  });

  it('keeps admin and trade-admin badges separate', () => {
    expect(
      adminUserBadges({ ...baseUser, roles: ['ROLE_USER', 'ROLE_ADMIN', 'ROLE_TRADE_ADMIN'] }),
    ).toEqual(['Admin', 'Inson admin']);
  });
});

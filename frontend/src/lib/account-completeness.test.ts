import { describe, expect, it } from 'vitest';
import { accountDetailsIncomplete } from './account-completeness';
import type { UserAccountResponse } from './accounts-types';

const account = {
  description: 'Akkount tavsifi',
  attributes: { platform: 'MOBILE', highest_division_level: 3, team_strength: 3150, device_transfer_limit: 5 },
} as unknown as UserAccountResponse;

describe('accountDetailsIncomplete', () => {
  it.each(['platform', 'highest_division_level', 'team_strength', 'device_transfer_limit'])('requires %s even when other details exist', (key) => {
    const attributes: Record<string, unknown> = { ...account.attributes };
    delete attributes[key];
    expect(accountDetailsIncomplete({ ...account, attributes })).toBe(true);
    expect(accountDetailsIncomplete({ ...account, attributes: { ...attributes, [key]: '   ' } })).toBe(true);
  });
  it.each([null, '', 'short'])('requires a complete description (%s)', (description) => {
    expect(accountDetailsIncomplete({ ...account, description })).toBe(true);
  });
  it('allows complete details without optional players or email', () => {
    expect(accountDetailsIncomplete(account)).toBe(false);
  });
  it.each(['STEAM', 'PLAYSTATION'])('does not require mobile transfer limits for %s', (platform) => {
    expect(accountDetailsIncomplete({ ...account, attributes: { platform, highest_division_level: '3', team_strength: 3150 } })).toBe(false);
  });
});

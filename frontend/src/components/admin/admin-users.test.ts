// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AdminUsers } from './admin-users';
import type { User } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock('@/app/admin/users/actions', () => ({
  deleteUserAction: vi.fn(),
  setUserRoleAction: vi.fn(),
}));

const USER_ID = 'a4f0b0de-6c1e-4a9e-9a0f-2f7a1c3d5e88';

function user(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    displayName: 'Xusniddin',
    email: 'x@example.com',
    telegramUsername: 'xusniddin',
    telegramLinked: true,
    googleLinked: true,
    verified: true,
    roles: ['ROLE_USER'],
    createdAt: '2026-08-01T09:00:00Z',
    ...overrides,
  };
}

function render(users: User[] = [user()]) {
  return renderToStaticMarkup(
    createElement(AdminUsers, {
      users,
      totalElements: users.length,
      currentUserId: null,
    }),
  );
}

describe('AdminUsers', () => {
  it('renders the user id, because the unmatched-credits form asks for it verbatim', () => {
    // Its only other sources were the database, a Telegram message, or the
    // href of the mailboxes link — all of which mean hand-transcribing a UUID
    // into the platform's one irreversible money action.
    expect(render()).toContain(USER_ID);
  });

  it('offers the id as a copy button rather than as text to select by hand', () => {
    const markup = render();
    expect(markup).toContain('Foydalanuvchi ID sidan nusxa olish');
    expect(markup).toContain('font-mono');
  });
});

// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  ADMIN_NAV_GROUPS,
  AdminShell,
  getActiveBreadcrumbs,
  isRouteActive,
} from './admin-shell';
import type { User } from '@/lib/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/payments/cards',
  useRouter: () => ({ refresh: () => {} }),
}));

const MOCK_ADMIN: User = {
  id: 'admin-123',
  displayName: 'Admin Boss',
  email: 'admin@efbazaar.uz',
  telegramUsername: 'efadmin',
  telegramLinked: true,
  googleLinked: true,
  verified: true,
  roles: ['ROLE_ADMIN'],
  createdAt: '2026-08-01T00:00:00Z',
};

function renderShell(user: User = MOCK_ADMIN, content = 'Admin Dashboard Content') {
  return renderToStaticMarkup(
    createElement(
      AdminShell,
      { user },
      createElement('div', { id: 'test-content' }, content),
    ),
  );
}

describe('AdminShell & Navigation', () => {
  it('correctly matches active routes including root and nested paths', () => {
    expect(isRouteActive('/admin', '/admin')).toBe(true);
    expect(isRouteActive('/admin/reports', '/admin')).toBe(false);
    expect(isRouteActive('/admin/payments/cards', '/admin/payments/cards')).toBe(true);
    expect(isRouteActive('/admin/mailboxes/123/messages', '/admin/mailboxes')).toBe(true);
  });

  it('correctly extracts breadcrumbs for active route', () => {
    const cardsBreadcrumbs = getActiveBreadcrumbs('/admin/payments/cards');
    expect(cardsBreadcrumbs.groupTitle).toBe("Moliya & To'lovlar");
    expect(cardsBreadcrumbs.itemLabel).toBe('Platforma kartalari');

    const rootBreadcrumbs = getActiveBreadcrumbs('/admin');
    expect(rootBreadcrumbs.groupTitle).toBe('Boshqaruv');
    expect(rootBreadcrumbs.itemLabel).toBe('Boshqaruv paneli');
  });

  it('renders all key ERP navigation groups and links', () => {
    const markup = renderShell();

    expect(markup).toContain('Boshqaruv');
    expect(markup).toContain('Savdo &amp; Moderatsiya');
    expect(markup).toContain("Moliya &amp; To&#x27;lovlar");
    expect(markup).toContain('Foydalanuvchilar');
    expect(markup).toContain('Tizim &amp; Resurslar');

    expect(markup).toContain('Platforma kartalari');
    expect(markup).toContain('Shikoyatlar');
    expect(markup).toContain('Pochtalar (Mailboxes)');
    expect(markup).toContain('O‘yinchilar bazasi');

    expect(markup).toContain('Admin Boss');
    expect(markup).toContain('Marketplacega qaytish');
    expect(markup).toContain('Admin Dashboard Content');
  });

  it('contains essential navigation items in ADMIN_NAV_GROUPS', () => {
    const allHrefs = ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).toContain('/admin');
    expect(allHrefs).toContain('/admin/listings');
    expect(allHrefs).toContain('/admin/reports');
    expect(allHrefs).toContain('/admin/trust');
    expect(allHrefs).toContain('/admin/payments/cards');
    expect(allHrefs).toContain('/admin/payments/unmatched');
    expect(allHrefs).toContain('/admin/payments/withdrawals');
    expect(allHrefs).toContain('/admin/payments/commission');
    expect(allHrefs).toContain('/admin/users');
    expect(allHrefs).toContain('/admin/mailboxes');
    expect(allHrefs).toContain('/admin/players');
    expect(allHrefs).toContain('/admin/attributes');
    expect(allHrefs).toContain('/admin/bot');
    expect(allHrefs).toContain('/admin/partners');
  });

  /**
   * Sahifa bor, lekin menyuda yo'q — bu xato jimgina o'tadi: manzilni qo'lda
   * yozgan odam sahifani ochadi va hammasi ishlaydi deb o'ylaydi, menyudan
   * qidirgan odam esa uni umuman topa olmaydi. Aynan shu `/admin/bot` bilan
   * sodir bo'ldi.
   *
   * Shuning uchun ro'yxatni qo'lda emas, fayl tizimidan o'qiymiz.
   */
  it('every admin page is reachable from the navigation', () => {
    const adminDir = path.join(process.cwd(), 'src/app/admin');

    const routes: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        // Dinamik segment (`[id]`) — bu detal sahifasi, menyuda bo'lmaydi.
        if (entry.name.startsWith('[')) continue;
        const route = `${prefix}/${entry.name}`;
        const child = path.join(dir, entry.name);
        if (existsSync(path.join(child, 'page.tsx'))) routes.push(route);
        walk(child, route);
      }
    };
    walk(adminDir, '/admin');

    const navHrefs = new Set(ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)));

    // Bayroq ostidagi sahifalar: fayli turadi, menyu esa FEATURES ga qarab
    // ularni chiqaradi yoki chiqarmaydi.
    const featureFlagged = new Set(['/admin/human-trades', '/admin/trade-admin-applications']);

    const orphaned = routes.filter((r) => !navHrefs.has(r) && !featureFlagged.has(r));
    expect(orphaned).toEqual([]);
  });
});

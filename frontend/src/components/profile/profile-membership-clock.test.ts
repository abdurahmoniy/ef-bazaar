// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ProfileMembership } from './profile-membership';
import type { MyPlan } from '@/lib/plans';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it.each(['active', 'grace'])('updates an open %s membership at its deadline and cleans timers', async mode => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const deadline = new Date(Date.now() + 1000).toISOString();
  const plan: MyPlan = mode === 'active' ? { code: 'PRO', expiresAt: deadline, entitlements: {} } : { code: 'STANDARD', expiresAt: null, entitlements: {}, lastPaidExpiresAt: '2026-10-01T00:00:00Z', graceEndsAt: deadline };
  try {
    await act(async () => root.render(createElement(ProfileMembership, { plan, catalog: [] })));
    expect(host.textContent).toContain(mode === 'active' ? 'Pro faol' : 'Grace:');
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
    expect(host.textContent).not.toContain(mode === 'active' ? 'Pro faol' : 'Grace:');
    expect(host.textContent).toContain(mode === 'active' ? 'muddati tugagan' : 'Recovery');
  } finally {
    await act(async () => root.unmount()); host.remove();
    expect(vi.getTimerCount()).toBe(0); vi.useRealTimers();
  }
});

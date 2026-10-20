// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanNotices } from './plan-notices';
let container: HTMLDivElement; let root: Root;
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetchMock); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('deduplicates durable notices, shows expiry/grace and acknowledges only on click', async () => {
  const notice = { id: 'one', kind: 'EXPIRED', paidExpiresAt: '2026-10-01T00:00:00Z', graceEndsAt: '2026-10-31T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', readAt: null };
  fetchMock.mockResolvedValueOnce(Response.json([notice, notice])).mockResolvedValueOnce(Response.json({ ...notice, readAt: '2026-10-02T00:00:00Z' }));
  await act(async () => root.render(createElement(PlanNotices)));
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).toContain('01.10.2026'); expect(container.textContent).toContain('31.10.2026');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/plans');
  await act(async () => container.querySelector('button')!.click());
  expect(fetchMock).toHaveBeenLastCalledWith('/api/payment/v1/payments/plans/notices/one/read', expect.objectContaining({ method: 'POST' }));
  expect(container.querySelector('article')).toBeNull();
});
it('shows a retryable error rather than swallowing notice failure', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
  await act(async () => root.render(createElement(PlanNotices)));
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.querySelector('button')?.textContent).toContain('Qayta');
});

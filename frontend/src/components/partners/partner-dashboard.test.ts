// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerDashboard } from './partner-dashboard';
import { getMyApplication } from '@/lib/partners';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/partners', () => ({ getMyApplication: vi.fn(), cancelPartnership: vi.fn() }));
vi.mock('@/components/partners/partner-panel/panel-blocks', () => ({ PartnerPanelBlocks: () => createElement('div', { 'data-panel': true }, 'Partner stats') }));
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('PartnerDashboard', () => {
  it('does not claim active status or mount panel APIs when application loading fails, and offers retry', async () => {
    vi.mocked(getMyApplication).mockRejectedValueOnce(new Error('Ulanish uzildi'));
    await act(async () => root.render(createElement(PartnerDashboard)));
    expect(container.textContent).not.toContain('Hamkorlik faol'); expect(container.querySelector('[data-panel]')).toBeNull();
    expect(container.textContent).toContain('Ulanish uzildi');
    const retry = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Qayta urinish'));
    expect(retry).toBeDefined();
    vi.mocked(getMyApplication).mockResolvedValue({ status: 'APPROVED', channelTitle: 'Kanal' } as never);
    await act(async () => retry!.click());
    expect(container.textContent).toContain('Hamkorlik faol'); expect(container.querySelector('[data-panel]')).not.toBeNull();
  });
  it('links to the application when no approved partnership exists', async () => {
    vi.mocked(getMyApplication).mockResolvedValue(null);
    await act(async () => root.render(createElement(PartnerDashboard)));
    expect(container.textContent).not.toContain('Hamkorlik faol'); expect(container.querySelector('[data-panel]')).toBeNull();
    expect(container.querySelector('a[href="/partnership"]')).not.toBeNull();
  });
});

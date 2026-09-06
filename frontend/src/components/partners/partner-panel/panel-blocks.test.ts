// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerPanelBlocks } from './panel-blocks';
import { getPartnerPanel, updatePostPrice, type PartnerPanel } from '@/lib/partner-panel';
vi.mock('@/lib/partner-panel', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/partner-panel')>(), getPartnerPanel: vi.fn(), updatePostPrice: vi.fn() }));
vi.mock('@/lib/growth-analytics', () => ({ trackGrowth: vi.fn() }));
const panel: PartnerPanel = { channel: { channelId: '1', title: 'Kanal', username: null, photoFileId: null, subscriberCount: 500, postPriceSom: 0 }, postSettings: { enabled: [], disabled: [], footer: null, footerLimit: 100 }, terms: { mode: 'PERCENT', tradePercent: 10, fixedMonthlySom: 0 }, funnel: { clicks: 0, registrations: 0 }, earnings: { fromPostsSom: 0, fromTradesSom: 0, monthlySom: 0 }, posts: [] };
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); vi.mocked(getPartnerPanel).mockResolvedValue(panel); vi.mocked(updatePostPrice).mockResolvedValue(panel);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(text));

describe('PartnerPanelBlocks', () => {
  it('flags current free pricing and requires an explicit choice before saving zero', async () => {
    await act(async () => root.render(createElement(PartnerPanelBlocks)));
    expect(container.textContent).toContain('Kanalingizga hozir bepul joylash mumkin');
    const save = button('Saqlash')!; await act(async () => save.click());
    expect(updatePostPrice).not.toHaveBeenCalled();
    expect(container.querySelector('#partner-post-price [role="alert"]')?.textContent).toContain('Bepul joylashni tanlang');
    const free = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(free).not.toBeNull(); await act(async () => free.click());
    await act(async () => save.click()); expect(updatePostPrice).toHaveBeenCalledWith(0);
  });
  it('keeps a positive owner-selected price without requiring the free choice', async () => {
    vi.mocked(getPartnerPanel).mockResolvedValue({ ...panel, channel: { ...panel.channel, postPriceSom: 25000 } });
    await act(async () => root.render(createElement(PartnerPanelBlocks)));
    expect(container.textContent).not.toContain('Kanalingizga hozir bepul joylash mumkin');
    await act(async () => button('Saqlash')!.click());
    expect(updatePostPrice).toHaveBeenCalledWith(25000);
  });
  it('offers recovery when panel load fails', async () => {
    vi.mocked(getPartnerPanel).mockRejectedValueOnce(new Error('Ulanish uzildi'));
    await act(async () => root.render(createElement(PartnerPanelBlocks)));
    expect(button('Qayta urinish')).toBeDefined(); await act(async () => button('Qayta urinish')!.click());
    expect(container.textContent).toContain('Kanalga e');
  });
});

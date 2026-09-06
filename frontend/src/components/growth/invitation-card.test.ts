// @vitest-environment jsdom
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: 'a' }));
import { InvitationCard } from './invitation-card';
import { ChannelOwnerCard } from './channel-owner-card';
import { CompletedTradeInvite } from './completed-trade-invite';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe('invitation access and promotion frequency', () => {
  it('prompts only after a successful trade, never during payment or after rejection', async () => {
    for (const state of ['WAITING_PAYMENT', 'REJECTED', 'ORPHANED'] as const) {
      await act(async () => root.render(React.createElement(CompletedTradeInvite, { state })));
      expect(host.querySelector('a')).toBeNull();
    }
    await act(async () => root.render(React.createElement(CompletedTradeInvite, { state: 'SUCCESS' })));
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/invite');
  });
  it('dismisses promotions while keeping permanent Profile access available', async () => {
    await act(async () => root.render(React.createElement(InvitationCard, { placement: 'marketplace', dismissible: true })));
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/invite');
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label]')!.click());
    expect(host.querySelector('a')).toBeNull();
    await act(async () => root.render(React.createElement(InvitationCard, { placement: 'profile' })));
    expect(host.querySelector('a')?.textContent).toContain('Taklif qilish');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/invite');
  });

  it('respects a dismissed promotion on a later mount', async () => {
    await act(async () => root.render(React.createElement(InvitationCard, { placement: 'marketplace', dismissible: true })));
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label]')!.click());
    await act(async () => root.render(null));
    await act(async () => root.render(React.createElement(InvitationCard, { placement: 'completed_trade', dismissible: true })));
    expect(host.querySelector('a')).toBeNull();
  });

  it('lets people dismiss even if browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    await act(async () => root.render(React.createElement(InvitationCard, { placement: 'marketplace', dismissible: true })));
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label]')!.click());
    expect(host.querySelector('a')).toBeNull();
  });

  it('routes existing partners to their panel and new owners to the offer', async () => {
    await act(async () => root.render(React.createElement(ChannelOwnerCard, { placement: 'profile', partner: false })));
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/partnership');
    expect(host.textContent).toContain('Telegram kanalingiz bormi?');
    await act(async () => root.render(React.createElement(ChannelOwnerCard, { placement: 'profile', partner: true })));
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/partner');
    expect(host.textContent).toContain('Hamkor paneli');
  });
});

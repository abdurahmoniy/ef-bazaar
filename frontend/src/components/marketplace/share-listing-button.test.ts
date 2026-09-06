// @vitest-environment jsdom
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const referrals = vi.hoisted(() => vi.fn());
vi.mock('@/lib/referrals', () => ({ getMyReferrals: referrals }));
import { ShareListingButton } from './share-listing-button';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  referrals.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function open(authenticated: boolean) {
  await act(async () => root.render(React.createElement(ShareListingButton, { listingId: 'listing-1', title: 'Epic Messi', authenticated })));
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
}
describe('listing share interaction', () => {
  it('lets guests share without fetching private referral details', async () => {
    await open(false);
    expect(referrals).not.toHaveBeenCalled();
    const link = new URL(host.querySelector('a')!.href);
    expect(link.searchParams.get('url')).toBe(`${window.location.origin}/marketplace/listing-1`);
  });
  it('attaches the signed-in inviter code while keeping the listing destination', async () => {
    referrals.mockResolvedValue({ code: 'ABCD1234' });
    await open(true);
    expect(new URL(host.querySelector('a')!.href).searchParams.get('url')).toContain('/marketplace/listing-1?ref=ABCD1234');
  });
  it('falls back to plain sharing when referral lookup fails', async () => {
    referrals.mockRejectedValue(new Error('unavailable'));
    await open(true);
    expect(host.querySelector('a')).not.toBeNull();
    expect(new URL(host.querySelector('a')!.href).searchParams.get('url')).not.toContain('ref=');
  });
  it('provides a selectable full URL after clipboard denial', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    await open(false);
    await act(async () => host.querySelector<HTMLButtonElement>('[role="region"] button')!.click());
    const fallback = host.querySelector<HTMLInputElement>('input[readonly]');
    expect(fallback?.value).toBe(`${window.location.origin}/marketplace/listing-1`);
  });
  it('closes with Escape and returns focus to the trigger', async () => {
    await open(false);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="region"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('button'));
  });
});

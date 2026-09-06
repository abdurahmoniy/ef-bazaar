// @vitest-environment jsdom
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));
vi.mock('@/components/referral/referral-capture', () => ({ ReferralCapture: ({ authenticated }: { authenticated: boolean }) => React.createElement('span', { 'data-claim-ready': authenticated }) }));
import { ReferralWelcome } from './referral-welcome';

let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  navigation.search = '';
  document.cookie = 'efbazaar_ref=; path=/; max-age=0';
  fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('landing invitation lifecycle', () => {
  it('recognizes a new invitation on same-page query navigation', async () => {
    await act(async () => root.render(React.createElement(ReferralWelcome)));
    expect(fetchMock).not.toHaveBeenCalled();
    document.cookie = 'efbazaar_ref=ABCD1234; path=/'; navigation.search = 'ref=ABCD1234';
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ authenticated: true }) });
    await act(async () => root.render(React.createElement(ReferralWelcome)));
    expect(host.textContent).toContain('xush kelibsiz');
    expect(host.querySelector('[data-claim-ready="true"]')).not.toBeNull();
  });
  it('retries a temporarily failed session probe without asking users to reload', async () => {
    vi.useFakeTimers(); document.cookie = 'efbazaar_ref=ABCD1234; path=/';
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => ({ authenticated: true }) });
    await act(async () => root.render(React.createElement(ReferralWelcome)));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-claim-ready="true"]')).not.toBeNull();
  });
});

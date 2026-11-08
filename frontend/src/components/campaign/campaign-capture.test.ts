// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CampaignCapture } from './campaign-capture';
import { CAMPAIGN_CLICK_COOKIE, CAMPAIGN_COOKIE, readCampaignCookie } from '@/lib/campaign-capture';

vi.mock('next/navigation', () => ({ usePathname: () => '/marketplace', useSearchParams: () => new URLSearchParams('') }));

let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
const set = (name: string, value: string) => { document.cookie = `${name}=${value}; path=/`; };
const clear = (name: string) => { document.cookie = `${name}=; path=/; max-age=0`; };
const read = (name: string) => readCampaignCookie(document.cookie, name);
const render = (authenticated?: boolean) =>
  act(async () => root.render(createElement(CampaignCapture, { authenticated })));
const calls = (suffix: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix));

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(String(url).endsWith('/claim')
      ? Response.json({ claimed: true })
      : new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  clear(CAMPAIGN_COOKIE);
  clear(CAMPAIGN_CLICK_COOKIE);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CampaignCapture', () => {
  it('sends a pending click once for an anonymous visitor and keeps the code for later', async () => {
    set(CAMPAIGN_COOKIE, 'GRP23456');
    set(CAMPAIGN_CLICK_COOKIE, 'GRP23456');

    await render();

    expect(calls('/campaigns/click')).toHaveLength(1);
    expect(read(CAMPAIGN_CLICK_COOKIE)).toBeNull();
    // Kirmagan odam da'vo qila olmaydi — kod ro'yxatdan o'tishni kutadi.
    expect(calls('/campaigns/claim')).toHaveLength(0);
    expect(read(CAMPAIGN_COOKIE)).toBe('GRP23456');
  });

  it('does not count a click again when no marker is present', async () => {
    set(CAMPAIGN_COOKIE, 'GRP23456');

    await render();

    expect(calls('/campaigns/click')).toHaveLength(0);
  });

  it('claims after login and clears the code once the server answered', async () => {
    set(CAMPAIGN_COOKIE, 'GRP23456');

    await render(true);

    expect(calls('/campaigns/claim')).toHaveLength(1);
    expect(read(CAMPAIGN_COOKIE)).toBeNull();
  });

  it('keeps the code when the claim fails so it can be retried', async () => {
    set(CAMPAIGN_COOKIE, 'GRP23456');
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));

    await render(true);

    expect(read(CAMPAIGN_COOKIE)).toBe('GRP23456');
  });
});

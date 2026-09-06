// @vitest-environment jsdom

import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferralCapture } from './referral-capture';
import { readCookieCode, REFERRAL_COOKIE } from '@/lib/referral-capture';

let pathname = '/marketplace';
let search = '';
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(search) }));
let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
const setCode = (code: string) => { document.cookie = `${REFERRAL_COOKIE}=${code}; path=/`; };
const currentCode = () => readCookieCode(document.cookie);
const render = (authenticated = true) => act(async () => root.render(createElement(ReferralCapture, { authenticated })));

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  pathname = '/marketplace';
  search = '';
  setCode('ABCD2345');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ claimed: true })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.cookie = `${REFERRAL_COOKIE}=; path=/; max-age=0`;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ReferralCapture', () => {
  it('keeps a code without making requests until authentication becomes available', async () => {
    await render(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(currentCode()).toBe('ABCD2345');
    await render();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentCode()).toBeNull();
  });

  it.each([true, false])('clears a code after a definitive result: %s', async (claimed) => {
    fetchMock.mockResolvedValue(Response.json({ claimed }));
    await render();
    expect(currentCode()).toBeNull();
  });

  it('preserves a temporary failure and retries with increasing delay', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 503 })));
    await render();
    expect(currentCode()).toBe('ABCD2345');
    await act(async () => vi.advanceTimersByTime(1000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValueOnce(Response.json({ claimed: true }));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(currentCode()).toBeNull();
  });

  it.each(['focus', 'online'])('retries on %s after a failed request', async (event) => {
    fetchMock.mockRejectedValueOnce(new TypeError('Offline'));
    await render();
    expect(currentCode()).toBe('ABCD2345');
    await act(async () => window.dispatchEvent(new Event(event)));
    expect(currentCode()).toBeNull();
  });

  it('cancels retries and listeners on unmount', async () => {
    fetchMock.mockRejectedValue(new TypeError('Offline'));
    await render();
    await act(async () => root.render(null));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentCode()).toBe('ABCD2345');
  });

  it('preserves a newer last-click code when an older request completes, then claims the new code', async () => {
    let complete!: (response: Response) => void;
    let completeNew!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { completeNew = resolve; }));
    await render();
    setCode('NEWC2345');
    await act(async () => complete(Response.json({ claimed: false })));
    expect(currentCode()).toBe('NEWC2345');
    expect(fetchMock).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ body: JSON.stringify({ code: 'NEWC2345' }) }));
    await act(async () => completeNew(Response.json({ claimed: true })));
    expect(currentCode()).toBeNull();
  });

  it('rechecks a cookie when a persistent shell navigates', async () => {
    await render();
    setCode('NEXT2345');
    pathname = '/profile';
    await render();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(currentCode()).toBeNull();
  });

  it('rechecks last-click attribution on same-page query navigation', async () => {
    await render();
    setCode('NEXT2345');
    search = '?ref=NEXT2345';
    await render();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(currentCode()).toBeNull();
  });

  it('shares one in-flight claim across StrictMode remounts', async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { complete = resolve; }));
    await act(async () => root.render(createElement(StrictMode, null, createElement(ReferralCapture, { authenticated: true }))));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => complete(Response.json({ claimed: true })));
    expect(currentCode()).toBeNull();
  });

  it('does not clear attribution after a request finishes on an unmounted page', async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    await render();
    await act(async () => root.render(null));
    await act(async () => complete(Response.json({ claimed: true })));
    expect(currentCode()).toBe('ABCD2345');
  });
});

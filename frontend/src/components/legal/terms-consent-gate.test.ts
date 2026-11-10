// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pathname } = vi.hoisted(() => ({ pathname: { current: '/marketplace' } }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

import { TermsConsentGate } from './terms-consent-gate';
import { OFERTA_HREF, PRIVACY_HREF, TERMS_VERSION } from '@/lib/legal';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  pathname.current = '/marketplace';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}
async function render() {
  await act(async () => root.render(createElement(TermsConsentGate)));
  await act(async () => { await Promise.resolve(); });
}

describe('TermsConsentGate', () => {
  it('stays hidden for guests and users who already agreed', async () => {
    fetchMock.mockReturnValueOnce(json({ required: false }));
    await render();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('asks for consent with links to both documents and records it', async () => {
    fetchMock.mockReturnValueOnce(json({ required: true }));
    await render();

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const hrefs = [...dialog!.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining([OFERTA_HREF, PRIVACY_HREF]));

    fetchMock.mockReturnValueOnce(json({ ok: true }));
    const accept = [...dialog!.querySelectorAll('button')].find((b) => b.textContent?.includes('Roziman'));
    await act(async () => { accept!.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/legal/consent', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ version: TERMS_VERSION }),
    }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the dialog and explains when saving fails', async () => {
    fetchMock.mockReturnValueOnce(json({ required: true }));
    await render();
    fetchMock.mockReturnValueOnce(json({}, false));
    const accept = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Roziman'));
    await act(async () => { accept!.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/saqlanmadi/);
  });

  it('does not cover the documents themselves so they can be read first', async () => {
    pathname.current = OFERTA_HREF;
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

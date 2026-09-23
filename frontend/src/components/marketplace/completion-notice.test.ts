// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompletionNotice } from './completion-notice';
let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('consumes the completion URL through Next’s external history API and preserves other parameters', async () => {
  history.replaceState({ __NA: true }, '', '/marketplace/one/advertise?channel=a&result=created#summary');
  const replace = vi.spyOn(history, 'replaceState');
  await act(async () => root.render(createElement(CompletionNotice, { title: 'E’lon joylandi', description: 'Xaridorlar ko‘rishi mumkin.' })));
  expect(replace).toHaveBeenCalledWith(null, '', '/marketplace/one/advertise?channel=a#summary');
  expect(document.activeElement?.textContent).toBe('E’lon joylandi');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Xaridorlar');
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(host.textContent).toBe('');
});

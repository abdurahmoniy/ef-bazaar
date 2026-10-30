// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleButton } from './google-button';

const SDK = 'https://accounts.google.com/gsi/client';
let root: Root;
let container: HTMLDivElement;
const credential = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  delete window.google;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    document.querySelector(`script[src="${SDK}"]`)?.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(15_000);
    root.unmount();
  });
  document.querySelectorAll(`script[src="${SDK}"]`).forEach(script => script.remove());
  container.remove();
  delete window.google;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function render(onCredential = credential, disabled = false) {
  await act(async () => root.render(createElement(GoogleButton, {
    clientId: 'client.apps.googleusercontent.com', onCredential, disabled,
  })));
}

function sdk() { return document.querySelector<HTMLScriptElement>(`script[src="${SDK}"]`)!; }
function button() { return container.querySelector('button')!; }
function available() {
  const initialize = vi.fn();
  const prompt = vi.fn();
  window.google = { accounts: { id: { initialize, prompt } } };
  return { initialize, prompt };
}

describe('Google sign-in availability', () => {
  it('shows a retryable error when the provider script fails instead of waiting forever', async () => {
    await render();
    await act(async () => sdk().dispatchEvent(new Event('error')));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Google yuklanmadi');
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('Qayta urinish');
  });

  it('stops waiting when a network request never finishes', async () => {
    await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Google yuklanmadi');
    expect(button().disabled).toBe(false);
  });

  it('retries with a fresh script and forwards the returned credential after recovery', async () => {
    await render();
    const first = sdk();
    await act(async () => first.dispatchEvent(new Event('error')));
    await act(async () => button().click());
    expect(sdk()).not.toBe(first);
    const api = available();
    await act(async () => sdk().dispatchEvent(new Event('load')));
    expect(button().disabled).toBe(false);
    await act(async () => button().click());
    expect(api.prompt).toHaveBeenCalledOnce();
    const config = api.initialize.mock.calls[0][0];
    config.callback({ credential: 'test-id-token' });
    expect(credential).toHaveBeenCalledWith('test-id-token');
  });

  it('uses a cached API and the latest callback while respecting pending authentication', async () => {
    const api = available();
    await render();
    const latest = vi.fn();
    await render(latest, true);
    expect(button().disabled).toBe(true);
    expect(api.initialize).toHaveBeenCalledOnce();
    api.initialize.mock.calls[0][0].callback({ credential: 'new-token' });
    expect(latest).toHaveBeenCalledWith('new-token');
    expect(credential).not.toHaveBeenCalled();
  });

  it('does not crash if a partial global exists before the script finishes', async () => {
    window.google = {} as NonNullable<Window['google']>;
    await render();
    const api = available();
    await act(async () => sdk().dispatchEvent(new Event('load')));
    expect(button().disabled).toBe(false);
    expect(api.initialize).toHaveBeenCalledOnce();
  });

  it('rejects a completed download with no usable Google API', async () => {
    await render();
    await act(async () => sdk().dispatchEvent(new Event('load')));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Google yuklanmadi');
  });

  it('surfaces initialization failures without enabling an unusable sign-in button', async () => {
    const api = available();
    api.initialize.mockImplementation(() => { throw new Error('Unavailable'); });
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Google yuklanmadi');
    expect(button().textContent).toContain('Qayta urinish');
  });

  it('shares the script in Strict Mode and initializes only the active mount', async () => {
    await act(async () => root.render(createElement(StrictMode, null,
      createElement(GoogleButton, { clientId: 'client', onCredential: credential }))));
    expect(document.querySelectorAll(`script[src="${SDK}"]`)).toHaveLength(1);
    const api = available();
    await act(async () => sdk().dispatchEvent(new Event('load')));
    expect(api.initialize).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not initialize a provider that arrives after unmount', async () => {
    await render();
    await act(async () => root.render(null));
    const api = available();
    await act(async () => sdk().dispatchEvent(new Event('load')));
    expect(api.initialize).not.toHaveBeenCalled();
  });
});

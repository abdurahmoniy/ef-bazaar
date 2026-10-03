// @vitest-environment jsdom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock('./player-filter-dialog', () => ({
  PlayerFilterDialog: ({ open, onApply }: { open: boolean; onApply(cards: undefined, strictness: number): void }) => open ? React.createElement('div', { role: 'dialog' }, React.createElement('button', { onClick: () => onApply(undefined, 4) }, 'Qo‘llash')) : null,
}));
import { PlayerFilterLauncher } from './player-filter-launcher';

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
afterEach(() => { routerPush.mockReset(); vi.unstubAllGlobals(); environment.IS_REACT_ACT_ENVIRONMENT = false; window.history.replaceState(null, '', '/marketplace'); });

it('opens the persistent selector from the detailed panel without relying on a native hashchange', async () => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(PlayerFilterLauncher, { currentQuery: '', authenticated: false, activeMatchCards: [] })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => {
      window.history.replaceState(null, '', '/marketplace#marketplace-player-filter');
      window.dispatchEvent(new Event('open-marketplace-player-filter'));
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('retains the detailed draft when players are applied before navigation commits', async () => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(PlayerFilterLauncher, { currentQuery: 'minPrice=100', authenticated: false, activeMatchCards: [] })));
    await act(async () => window.dispatchEvent(new CustomEvent('open-marketplace-player-filter', { detail: 'minPrice=250000&q=Messi' })));
    await act(async () => container.querySelector('button')!.click());
    const target = new URL(routerPush.mock.calls[0][0], 'http://localhost');
    expect(target.searchParams.get('minPrice')).toBe('250000');
    expect(target.searchParams.get('q')).toBe('Messi');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

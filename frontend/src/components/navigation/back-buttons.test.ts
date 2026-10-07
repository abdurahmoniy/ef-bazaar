// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TopBackButton } from './top-back-button';
import { BackLink } from './back-link';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), nativeBack: vi.fn(() => true) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/hooks/use-telegram-back-button', () => ({ useTelegramBackButton: mocks.nativeBack }));

afterEach(() => { vi.clearAllMocks(); });

it.each([['header', TopBackButton], ['page', BackLink]] as const)('keeps the %s back link when Telegram activates its native handler', async (_location, Component) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(Component, { href: '/marketplace' })));
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/marketplace');
    expect(mocks.nativeBack).toHaveBeenCalledWith(expect.any(Function));
    await act(async () => link!.click());
    expect(mocks.replace).toHaveBeenCalledWith('/marketplace');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  }
});

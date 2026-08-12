// @vitest-environment jsdom

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TelegramBackProvider,
  useTelegramBackLayer,
} from './telegram-back-provider';
import { TelegramViewportBootstrap } from './telegram-viewport-bootstrap';
import type { TelegramWebApp } from '@/lib/types';

function createFakeWebApp() {
  const backHandlers = new Set<() => void>();
  const eventHandlers = new Map<string, Set<() => void>>();
  const onEvent = vi.fn((event: string, handler: () => void) => {
    const handlers = eventHandlers.get(event) ?? new Set();
    handlers.add(handler);
    eventHandlers.set(event, handlers);
  });
  const offEvent = vi.fn((event: string, handler: () => void) => {
    eventHandlers.get(event)?.delete(handler);
  });
  return {
    webApp: {
      initData: 'fixture',
      colorScheme: 'light' as const,
      viewportStableHeight: 700,
      safeAreaInset: { top: 20, right: 0, bottom: 10, left: 0 },
      contentSafeAreaInset: { top: 36, right: 0, bottom: 18, left: 0 },
      ready: vi.fn(),
      expand: vi.fn(),
      onEvent,
      offEvent,
      setHeaderColor: vi.fn(),
      setBackgroundColor: vi.fn(),
      setBottomBarColor: vi.fn(),
      disableVerticalSwipes: vi.fn(),
      enableVerticalSwipes: vi.fn(),
      BackButton: {
        isVisible: false,
        show: vi.fn(),
        hide: vi.fn(),
        onClick: vi.fn((handler: () => void) => backHandlers.add(handler)),
        offClick: vi.fn((handler: () => void) => backHandlers.delete(handler)),
      },
    },
    pressBack: () => backHandlers.forEach((handler) => handler()),
    emit: (event: string) => eventHandlers.get(event)?.forEach((handler) => handler()),
    backHandlers,
    eventHandlers,
  };
}

function Layer({
  id,
  onBack,
  active = true,
  lockVerticalSwipes = true,
}: {
  id: string;
  onBack: () => void;
  active?: boolean;
  lockVerticalSwipes?: boolean;
}) {
  useTelegramBackLayer({
    id,
    kind: 'overlay',
    onBack,
    lockVerticalSwipes,
  }, active);
  return null;
}

function Harness({
  first,
  second,
  firstBack,
  secondBack,
}: {
  first: boolean;
  second: boolean;
  firstBack: () => void;
  secondBack: () => void;
}) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(TelegramViewportBootstrap),
    React.createElement(
      TelegramBackProvider,
      null,
      React.createElement(Layer, { id: 'first-overlay', onBack: firstBack, active: first }),
      React.createElement(Layer, { id: 'second-overlay', onBack: secondBack, active: second }),
    ),
  );
}

describe('Telegram Mini App lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    delete document.documentElement.dataset.resolvedTheme;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    delete document.documentElement.dataset.resolvedTheme;
    delete window.Telegram;
    vi.restoreAllMocks();
  });

  it('owns one native listener, closes overlays LIFO, locks swipes, syncs theme, and cleans up', async () => {
    const fake = createFakeWebApp();
    const firstOverlayBack = vi.fn();
    const secondOverlayBack = vi.fn();
    window.Telegram = { WebApp: fake.webApp as TelegramWebApp };

    await act(async () => {
      root.render(React.createElement(Harness, {
        first: true,
        second: true,
        firstBack: firstOverlayBack,
        secondBack: secondOverlayBack,
      }));
    });

    expect(fake.webApp.BackButton.onClick).toHaveBeenCalledTimes(1);
    await act(async () => fake.pressBack());
    expect(secondOverlayBack).toHaveBeenCalledTimes(1);
    expect(firstOverlayBack).not.toHaveBeenCalled();
    expect(fake.webApp.disableVerticalSwipes).toHaveBeenCalled();

    const enablesBeforeClosing = fake.webApp.enableVerticalSwipes.mock.calls.length;
    await act(async () => {
      root.render(React.createElement(Harness, {
        first: true,
        second: false,
        firstBack: firstOverlayBack,
        secondBack: secondOverlayBack,
      }));
    });
    expect(fake.webApp.enableVerticalSwipes).toHaveBeenCalledTimes(enablesBeforeClosing);

    await act(async () => {
      root.render(React.createElement(Harness, {
        first: false,
        second: false,
        firstBack: firstOverlayBack,
        secondBack: secondOverlayBack,
      }));
    });
    expect(fake.webApp.enableVerticalSwipes.mock.calls.length).toBeGreaterThan(enablesBeforeClosing);

    (fake.webApp as TelegramWebApp).colorScheme = 'dark';
    await act(async () => fake.emit('themeChanged'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await act(async () => root.unmount());
    expect(fake.backHandlers.size).toBe(0);
    expect([...fake.eventHandlers.values()].every((handlers) => handlers.size === 0)).toBe(true);
    expect(fake.webApp.BackButton.offClick).toHaveBeenCalledTimes(1);

    root = createRoot(container);
  });
});

// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { TelegramBackProvider } from '@/components/telegram/telegram-back-provider';
import { PLAYER_FILTER_CACHE_KEY } from '@/lib/player-filter-cache';
import type { DreamTeam } from '@/lib/marketplace-types';
import type { TelegramWebApp } from '@/lib/types';
import { PlayerFilterDialog } from './player-filter-dialog';
import { PlayerFilterLauncher } from './player-filter-launcher';

const source = readFileSync(resolve(process.cwd(), 'src/components/marketplace/player-filter-dialog.tsx'), 'utf8');
const launcher = readFileSync(resolve(process.cwd(), 'src/components/marketplace/player-filter-launcher.tsx'), 'utf8');
const browser = readFileSync(resolve(process.cwd(), 'src/components/marketplace/marketplace-browser.tsx'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'src/app/marketplace/page.tsx'), 'utf8');

const playerId = '11111111-1111-4111-8111-111111111111';
const secondPlayerId = '22222222-2222-4222-8222-222222222222';

const team: DreamTeam = {
  id: 'team-1',
  name: 'Mening jamoam',
  formation: '4-3-3',
  slots: [{
    index: 0,
    position: 'GK',
    w: 3,
    card: { efhubId: 101, playerId, name: 'Lionel Messi' },
  }],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const cards = [
  {
    efhubId: 101,
    playerId,
    name: 'Lionel Messi',
    maxOverallRating: 106,
    cardType: 'EPIC' as const,
    metaTier: 'META' as const,
    metaPriority: 100,
    imageUrl: '/messi.png',
  },
  {
    efhubId: 202,
    playerId: secondPlayerId,
    name: 'Neymar Jr',
    maxOverallRating: 104,
    cardType: 'BIGTIME' as const,
    metaTier: 'META' as const,
    metaPriority: 90,
    imageUrl: '/neymar.png',
  },
  {
    efhubId: 303,
    playerId,
    name: 'Lionel Messi',
    maxOverallRating: 99,
    cardType: 'SHOWTIME' as const,
    metaTier: 'META' as const,
    metaPriority: 80,
    imageUrl: '/messi-showtime.png',
  },
];

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function successfulFetch(input: string | URL | Request) {
  const url = String(input);
  if (url.includes('dream-teams')) return Promise.resolve(jsonResponse([team]));
  if (url.includes('/cards')) {
    return Promise.resolve(jsonResponse({ items: cards, total: cards.length }));
  }
  return Promise.resolve(jsonResponse({}));
}

function renderWithProviders(node: React.ReactNode) {
  return act(async () => {
    root.render(React.createElement(TelegramBackProvider, null, node));
  });
}

function buttonNamed(name: string, scope: ParentNode = document) {
  const button = Array.from(scope.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.includes(name)
      || candidate.getAttribute('aria-label')?.includes(name),
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${name}`);
  return button;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
  });
}

async function clickTab(name: string) {
  const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(
    (candidate) => candidate.textContent?.includes(name),
  );
  if (!(tab instanceof HTMLElement)) throw new Error(`Missing tab: ${name}`);
  await act(async () => {
    tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    tab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function launcherNode(overrides: Partial<React.ComponentProps<typeof PlayerFilterLauncher>> = {}) {
  return React.createElement(PlayerFilterLauncher, {
    currentQuery: 'q=Messi&sort=price%2Casc&view=list&page=4',
    activeMatchCards: [],
    activeMinMatch: 4,
    authenticated: true,
    ...overrides,
  });
}

function createTelegramWebApp() {
  const backHandlers = new Set<() => void>();
  const webApp = {
    initData: 'fixture',
    BackButton: {
      isVisible: false,
      show: vi.fn(),
      hide: vi.fn(),
      onClick: vi.fn((handler: () => void) => { backHandlers.add(handler); }),
      offClick: vi.fn((handler: () => void) => { backHandlers.delete(handler); }),
    },
    disableVerticalSwipes: vi.fn(),
    enableVerticalSwipes: vi.fn(),
    HapticFeedback: {
      selectionChanged: vi.fn(),
      notificationOccurred: vi.fn(),
    },
  } as unknown as TelegramWebApp;
  return { backHandlers, webApp };
}

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  routerPush.mockReset();
  fetchMock = vi.fn(successfulFetch);
  vi.stubGlobal('fetch', fetchMock);
  window.matchMedia = vi.fn(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  window.history.replaceState(null, '', '/marketplace');
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.style.pointerEvents = '';
  window.history.replaceState(null, '', '/marketplace');
  window.sessionStorage.clear();
  delete window.Telegram;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
});

describe('PlayerFilterDialog accessibility contract', () => {
  it('uses focus-managed dialog and keyboard-aware tabs primitives', () => {
    expect(source).toContain("@radix-ui/react-dialog");
    expect(source).toContain('<Dialog.Root');
    expect(source).toContain('<Dialog.Title');
    expect(source).toContain('<Dialog.Description');
    expect(source).toContain("@radix-ui/react-tabs");
    expect(source).toContain('<Tabs.Root');
  });

  it('exposes selection and priority states with touch-sized controls', () => {
    expect(source).toContain('aria-pressed={isPicked}');
    expect(source).toContain('min-h-11');
    expect(source).toContain('motion-reduce:animate-none');
  });

  it('supports recoverable, explicit catalogue pagination', () => {
    expect(source).toContain('Yana yuklash');
    expect(source).toContain('Qayta urinish');
    expect(source).toContain('page: String(page)');
    expect(source).toContain('controller.abort()');
  });

  it('records interest only after Apply and never blocks navigation', () => {
    expect(launcher).toContain("['v1', 'card-interest', 'apply']");
    expect(launcher).toContain('keepalive: true');
    expect(launcher).toContain('.catch(() => undefined)');
    expect(launcher.indexOf("['v1', 'card-interest', 'apply']"))
      .toBeGreaterThan(launcher.indexOf('function apply('));
    expect(launcher.indexOf('router.push('))
      .toBeGreaterThan(launcher.indexOf("['v1', 'card-interest', 'apply']"));
    expect(launcher).not.toContain('anonymousToken');
  });

  it('enforces and explains the eleven-player match limit before serialization', () => {
    expect(source).toContain('MAX_MATCH_PLAYERS = 11');
    expect(source).toContain('current.length >= MAX_MATCH_PLAYERS');
    expect(source).toContain('Ko&apos;pi bilan 11 ta o&apos;yinchi');
  });

  it('automatically applies the singleton Dream Team when its tab is active', () => {
    expect(source).toContain("const activeTeam = tab === 'team' ? teams[0] ?? null : null;");
    expect(source).not.toContain('activeTeamId');
    expect(source).not.toContain('teams.map((team)');
    expect(source).toContain('<DreamTeamPitch slots={team.slots} formation={team.formation} readOnly />');
  });

  it('uses the approved buyer-facing copy and Telegram sheet semantics', () => {
    expect(source).toContain('O‘yinchilar');
    expect(source).toContain('o‘yinchi bo‘yicha qidirish');
    expect(source).toContain('META kartalar hozircha yo‘q');
    expect(source).toContain('useTelegramBackLayer');
    expect(source).toContain("kind: 'overlay'");
    expect(source).toContain('lockVerticalSwipes: true');
    expect(source).toContain('var(--tg-viewport-height');
    expect(source).toContain('var(--app-content-safe-bottom)');
    expect(source).toContain('telegramHaptic');
    expect(source).not.toContain('Karta #');
    expect(source).not.toContain('/admin/players');
    expect(source.toLowerCase()).not.toContain('weighted');
  });

  it('passes authentication state from the page into the player launcher', () => {
    expect(page).toContain('authenticated={user !== null}');
    expect(browser).toContain('authenticated: boolean');
    expect(browser).toContain('authenticated={authenticated}');
    expect(launcher).toContain('authenticated: boolean');
  });
});

describe('PlayerFilterLauncher lifecycle', () => {
  it('loads neither teams nor catalogue before open, then loads the team only once', async () => {
    await renderWithProviders(launcherNode());
    expect(fetchMock).not.toHaveBeenCalled();

    await click(buttonNamed('O‘yinchilar', container));
    await settle();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('dream-teams')))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/cards')))
      .toHaveLength(1);

    await click(buttonNamed('Yopish'));
    await click(buttonNamed('O‘yinchilar', container));
    await settle();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('dream-teams')))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/cards')))
      .toHaveLength(2);
  });

  it('aborts in-flight catalogue work on close and team work on unmount', async () => {
    const signals: Record<string, AbortSignal> = {};
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const key = String(input).includes('dream-teams') ? 'team' : 'cards';
      if (init?.signal) signals[key] = init.signal;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    await renderWithProviders(launcherNode());
    await click(buttonNamed('O‘yinchilar', container));
    expect(signals.team?.aborted).toBe(false);
    expect(signals.cards?.aborted).toBe(false);
    await click(buttonNamed('Yopish'));
    expect(signals.cards?.aborted).toBe(true);
    expect(signals.team?.aborted).toBe(false);

    await act(async () => root.unmount());
    expect(signals.team?.aborted).toBe(true);
    root = createRoot(container);
  });

  it('hydrates exact card identity, tolerates storage failures, and preserves raw query on apply', async () => {
    window.sessionStorage.setItem(PLAYER_FILTER_CACHE_KEY, JSON.stringify([{
      efhubId: 101,
      playerId,
      name: 'Lionel Messi',
      maxOverallRating: 106,
      cardType: 'EPIC',
      imageUrl: '/messi.png',
    }]));
    await renderWithProviders(launcherNode({
      activeMatchCards: [`101:${playerId}:P`],
      activeMinMatch: 7,
    }));
    await click(buttonNamed('O‘yinchilar', container));
    await settle();
    expect(document.body.textContent).toContain('Lionel Messi');
    expect(document.body.textContent).not.toContain('Karta #101');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    await click(buttonNamed('1 o‘yinchi bo‘yicha qidirish'));

    expect(routerPush).toHaveBeenCalledTimes(1);
    const href = routerPush.mock.calls[0]?.[0] as string;
    const params = new URL(href, 'https://example.test').searchParams;
    expect(params.get('q')).toBe('Messi');
    expect(params.get('sort')).toBe('price,asc');
    expect(params.get('view')).toBe('list');
    expect(params.has('page')).toBe(false);
    expect(params.getAll('matchCard')).toEqual([`101:${playerId}:P`]);
    expect(params.get('matchStrictness')).toBe('7');

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    await act(async () => root.unmount());
    root = createRoot(container);
    await expect(renderWithProviders(launcherNode({
      activeMatchCards: [`101:${playerId}:N`],
    }))).resolves.toBeUndefined();
  });

  it('owns its stable hash, preserves the public query on close, and can reopen', async () => {
    window.history.replaceState(null, '', '/marketplace?q=Messi&view=list#marketplace-player-filter');
    await renderWithProviders(launcherNode());
    await settle();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click(buttonNamed('Yopish'));

    expect(window.location.pathname).toBe('/marketplace');
    expect(window.location.search).toBe('?q=Messi&view=list');
    expect(window.location.hash).toBe('');

    window.history.replaceState(null, '', '/marketplace?q=Messi&view=list#marketplace-player-filter');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await settle();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('ignores malformed successful Dream Team payloads', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      if (String(input).includes('dream-teams')) {
        return Promise.resolve(jsonResponse({ content: [{ id: 'bad', slots: null }] }));
      }
      return Promise.resolve(jsonResponse({ items: [], total: 0 }));
    });

    await renderWithProviders(launcherNode());
    await click(buttonNamed('O‘yinchilar', container));
    await clickTab('Mening jamoam');
    await settle();

    expect(document.body.textContent).toContain("Saqlangan jamoa yo'q");
    expect(document.body.textContent).not.toContain('Jamoani tahrirlash');
  });

  it('routes the empty singleton-team state according to authentication', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      if (String(input).includes('dream-teams')) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse({ items: [], total: 0 }));
    });
    await renderWithProviders(launcherNode({ authenticated: false }));
    await click(buttonNamed('O‘yinchilar', container));
    await clickTab('Mening jamoam');
    await settle();
    const signedOutTeamLink = Array.from(document.querySelectorAll('a')).find(
      (link) => link.textContent?.includes('Jamoa tuzish'),
    );
    expect(document.body.textContent).toContain("Saqlangan jamoa yo'q");
    expect(signedOutTeamLink?.getAttribute('href')).toBe('/auth/login?from=/dream-team');

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderWithProviders(launcherNode({ authenticated: true }));
    await click(buttonNamed('O‘yinchilar', container));
    await clickTab('Mening jamoam');
    await settle();
    expect(document.querySelector('a[href="/dream-team"]')).not.toBeNull();
  });

  it('accepts the singleton team from a paged response wrapper', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      if (String(input).includes('dream-teams')) {
        return Promise.resolve(jsonResponse({ content: [team] }));
      }
      return Promise.resolve(jsonResponse({ items: [], total: 0 }));
    });
    await renderWithProviders(launcherNode());
    await click(buttonNamed('O‘yinchilar', container));
    await clickTab('Mening jamoam');
    await settle();

    expect(document.body.textContent).toContain('1/11');
    expect(document.querySelector('a[href="/dream-team"]')?.textContent)
      .toContain('Jamoani tahrirlash');
  });
});

describe('PlayerFilterDialog Telegram interactions', () => {
  it('switches alternate editions without duplicating the canonical player', async () => {
    const telegram = createTelegramWebApp();
    window.Telegram = { WebApp: telegram.webApp };
    await renderWithProviders(React.createElement(PlayerFilterDialog, {
      open: true,
      onOpenChange: vi.fn(),
      teams: [],
      authenticated: true,
      selected: [],
      activeMinMatch: 4,
      onApply: vi.fn(),
      activeCount: 0,
    }));
    await settle();
    const editions = Array.from(document.querySelectorAll('button[title="Lionel Messi"]'));
    expect(editions).toHaveLength(2);
    await click(editions[0]);
    await click(editions[1]);

    expect(editions[0].getAttribute('aria-pressed')).toBe('false');
    expect(editions[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttonNamed('1 o‘yinchi bo‘yicha qidirish')).toBeTruthy();
    expect(telegram.webApp.HapticFeedback?.selectionChanged).toHaveBeenCalledTimes(2);
  });

  it('hydrates a late selected snapshot once without overwriting open user edits', async () => {
    const onApply = vi.fn();
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      teams: [] as DreamTeam[],
      authenticated: true,
      activeMinMatch: 4,
      onApply,
      activeCount: 1,
    };
    await renderWithProviders(React.createElement(PlayerFilterDialog, {
      ...props,
      selected: [{ efhubId: 101, playerId, name: 'Tanlangan karta' }],
    }));
    await settle();
    await act(async () => root.render(React.createElement(TelegramBackProvider, null,
      React.createElement(PlayerFilterDialog, {
        ...props,
        selected: [{ efhubId: 101, playerId, name: 'Lionel Messi', imageUrl: '/messi.png' }],
      }))));
    expect(document.body.textContent).toContain('Lionel Messi');

    await click(buttonNamed('Neymar Jr'));
    await act(async () => root.render(React.createElement(TelegramBackProvider, null,
      React.createElement(PlayerFilterDialog, {
        ...props,
        selected: [{ efhubId: 101, playerId, name: 'Lionel Messi', imageUrl: '/new.png' }],
      }))));
    expect(buttonNamed('2 o‘yinchi bo‘yicha qidirish')).toBeTruthy();
  });

  it('preserves user selection during late metadata hydration', async () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      teams: [] as DreamTeam[],
      authenticated: true,
      activeMinMatch: 4,
      onApply: vi.fn(),
      activeCount: 1,
    };
    await renderWithProviders(React.createElement(PlayerFilterDialog, {
      ...props,
      selected: [{ efhubId: 101, playerId, name: 'Tanlangan karta' }],
    }));
    expect(buttonNamed('1 o‘yinchi bo‘yicha qidirish')).toBeTruthy();

    await act(async () => root.render(React.createElement(TelegramBackProvider, null,
      React.createElement(PlayerFilterDialog, {
        ...props,
        selected: [{
          efhubId: 101,
          playerId,
          name: 'Lionel Messi',
          imageUrl: '/messi.png',
        }],
      }))));

    expect(buttonNamed('1 o‘yinchi bo‘yicha qidirish')).toBeTruthy();
    expect(document.body.textContent).toContain('Lionel Messi');
  });

  it('keeps alternate editions enabled when eleven distinct players are selected', async () => {
    const selected = [
      { efhubId: 999, playerId, name: 'Lionel Messi' },
      ...Array.from({ length: 10 }, (_, index) => ({
        efhubId: 1000 + index,
        playerId: `${String(index + 10).padStart(2, '0')}111111-1111-4111-8111-111111111111`,
        name: `Player ${index + 1}`,
      })),
    ];
    await renderWithProviders(React.createElement(PlayerFilterDialog, {
      open: true,
      onOpenChange: vi.fn(),
      teams: [],
      authenticated: true,
      selected,
      activeMinMatch: 4,
      onApply: vi.fn(),
      activeCount: 11,
    }));
    await settle();

    const editions = Array.from(document.querySelectorAll('button[title="Lionel Messi"]'));
    expect(editions).toHaveLength(2);
    expect(editions.every((edition) => !(edition as HTMLButtonElement).disabled)).toBe(true);
    await click(editions[0]);
    expect(buttonNamed('11 o‘yinchi bo‘yicha qidirish')).toBeTruthy();
  });

  it('emits one haptic per mutation under StrictMode and none for a rejected twelfth pick', async () => {
    const telegram = createTelegramWebApp();
    window.Telegram = { WebApp: telegram.webApp };
    const selected = Array.from({ length: 11 }, (_, index) => ({
      efhubId: 1000 + index,
      playerId: `${String(index + 30).padStart(2, '0')}111111-1111-4111-8111-111111111111`,
      name: `Player ${index + 1}`,
    }));
    await act(async () => root.render(React.createElement(
      React.StrictMode,
      null,
      React.createElement(TelegramBackProvider, null,
        React.createElement(PlayerFilterDialog, {
          open: true,
          onOpenChange: vi.fn(),
          teams: [],
          authenticated: true,
          selected: [],
          activeMinMatch: 4,
          onApply: vi.fn(),
          activeCount: 0,
        })),
    )));
    await settle();
    await click(buttonNamed('Lionel Messi'));
    expect(telegram.webApp.HapticFeedback?.selectionChanged).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(React.createElement(
      React.StrictMode,
      null,
      React.createElement(TelegramBackProvider, null,
        React.createElement(PlayerFilterDialog, {
          open: true,
          onOpenChange: vi.fn(),
          teams: [],
          authenticated: true,
          selected,
          activeMinMatch: 4,
          onApply: vi.fn(),
          activeCount: 11,
        })),
    )));
    await settle();
    telegram.webApp.HapticFeedback?.selectionChanged
      && vi.mocked(telegram.webApp.HapticFeedback.selectionChanged).mockClear();
    await click(buttonNamed('Lionel Messi'));
    expect(telegram.webApp.HapticFeedback?.selectionChanged).not.toHaveBeenCalled();
  });

  it('haptics only real selection mutations and success after one apply', async () => {
    const telegram = createTelegramWebApp();
    window.Telegram = { WebApp: telegram.webApp };
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    await renderWithProviders(React.createElement(PlayerFilterDialog, {
      open: true,
      onOpenChange,
      teams: [],
      authenticated: true,
      selected: [],
      activeMinMatch: 4,
      onApply,
      activeCount: 0,
    }));
    await settle();

    await click(buttonNamed('Lionel Messi'));
    expect(telegram.webApp.HapticFeedback?.selectionChanged).toHaveBeenCalledTimes(1);
    await click(buttonNamed('Neymar Jr'));
    expect(telegram.webApp.HapticFeedback?.selectionChanged).toHaveBeenCalledTimes(2);
    const apply = buttonNamed('2 o‘yinchi bo‘yicha qidirish');
    await act(async () => {
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(telegram.webApp.HapticFeedback?.notificationOccurred).toHaveBeenCalledTimes(1);
    expect(telegram.webApp.HapticFeedback?.notificationOccurred).toHaveBeenCalledWith('success');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('native Back closes, restores trigger focus, and releases the swipe lock', async () => {
    const telegram = createTelegramWebApp();
    window.Telegram = { WebApp: telegram.webApp };
    const priorFocus = document.createElement('button');
    document.body.append(priorFocus);
    priorFocus.focus();
    await renderWithProviders(launcherNode());
    const trigger = buttonNamed('O‘yinchilar', container);
    expect(trigger.id).toBe('marketplace-player-filter');
    expect(document.activeElement).toBe(priorFocus);
    await click(trigger);
    expect(telegram.webApp.disableVerticalSwipes).toHaveBeenCalledTimes(1);
    await act(async () => {
      telegram.backHandlers.forEach((handler) => handler());
      await Promise.resolve();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(telegram.webApp.enableVerticalSwipes).toHaveBeenCalled();
    priorFocus.remove();
  });
});

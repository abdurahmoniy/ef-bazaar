// @vitest-environment jsdom

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { CardPickerField } from './card-picker-field';
import { ListingFilterFields } from './listing-filter-fields';
import { ListingFilters } from './listing-filters';
import { MarketplaceFilterSheet } from './marketplace-filter-sheet';
import { MarketplaceNavigationProvider } from './marketplace-navigation';
import { TelegramBackProvider } from '@/components/telegram/telegram-back-provider';
import {
  clearMarketplaceFilterDraft,
  type MarketplaceFilterDraft,
} from '@/lib/marketplace-filter-draft';
import type { ListingBrowseParams } from '@/lib/marketplace-types';
import type { TelegramWebApp } from '@/lib/types';

const source = (file: string) => readFileSync(
  resolve(process.cwd(), 'src/components/marketplace', file),
  'utf8',
);

const sheetSource = source('marketplace-filter-sheet.tsx');
const fieldsSource = source('listing-filter-fields.tsx');
const cardFieldSource = source('card-picker-field.tsx');
const filtersSource = source('listing-filters.tsx');
const browserSource = source('marketplace-browser.tsx');

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

function matchMedia(matches = false): MediaQueryList {
  return {
    matches,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

function renderWithProviders(node: React.ReactNode) {
  return act(async () => {
    root.render(React.createElement(
      MarketplaceNavigationProvider,
      null,
      React.createElement(TelegramBackProvider, null, node),
    ));
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

function controlNamed(name: string, scope: ParentNode = document) {
  const inputs = Array.from(scope.querySelectorAll('input, select'));
  const match = inputs.find((candidate) => candidate.getAttribute('aria-label')?.includes(name));
  if (match && (match instanceof HTMLInputElement || match instanceof HTMLSelectElement)) {
    return match;
  }

  const label = Array.from(scope.querySelectorAll('label')).find(
    (candidate) => candidate.textContent?.includes(name),
  );
  if (!(label instanceof HTMLLabelElement)) throw new Error(`Missing label: ${name}`);
  const control = document.getElementById(label.htmlFor);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
    throw new Error(`Missing control for: ${name}`);
  }
  return control;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
}

async function input(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function countResponse(count: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ totalElements: count }),
  } as Response;
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
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
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  window.matchMedia = vi.fn(() => matchMedia(false));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.style.pointerEvents = '';
  delete window.Telegram;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  vi.restoreAllMocks();
});

describe('marketplace detailed filter sheet contract', () => {
  it('uses Radix, validation, cancellable 300ms preview, Telegram Back, and semantic insets', () => {
    expect(sheetSource).toContain("@radix-ui/react-dialog");
    expect(sheetSource).toContain('<Dialog.Title');
    expect(sheetSource).toContain('<Dialog.Description');
    expect(sheetSource).toContain('300');
    expect(sheetSource).toContain('AbortController');
    expect(sheetSource).toContain('controller.abort()');
    expect(sheetSource).toContain('validateMarketplaceFilterDraft');
    expect(sheetSource).toContain('useTelegramBackLayer');
    expect(sheetSource).toContain("kind: 'overlay'");
    expect(sheetSource).toContain('lockVerticalSwipes: true');
    expect(sheetSource).toContain('var(--tg-viewport-height,92dvh)');
    expect(sheetSource).toContain('var(--app-content-safe-bottom)');
    expect(sheetSource).toContain('overscroll-contain');
  });

  it('renders the exact labeled groups, numeric/error semantics, and controlled card picker', async () => {
    expect(fieldsSource).toContain('Asosiy');
    expect(fieldsSource).toContain('Akkount');
    expect(fieldsSource).toContain('Xavfsizlik');
    expect(fieldsSource).toContain('<Label');
    expect(fieldsSource).toContain('aria-invalid');
    expect(fieldsSource).toContain('role="alert"');
    expect(fieldsSource).toContain('inputMode="numeric"');
    expect(fieldsSource).toContain('type="number"');
    expect(cardFieldSource).toContain('value: PlayerCard | null');
    expect(cardFieldSource).toContain('onChange(value: PlayerCard | null): void');
    expect(cardFieldSource).not.toContain('useState');

    const draft = clearMarketplaceFilterDraft();
    await act(async () => root.render(React.createElement(ListingFilterFields, {
      draft,
      errors: { minPrice: 'Narx xato.' },
      onChange: vi.fn(),
    })));
    const minimumPrice = controlNamed('Eng kam narx', container);
    expect(minimumPrice.getAttribute('aria-invalid')).toBe('true');
    expect(minimumPrice.nextElementSibling?.getAttribute('role')).toBe('alert');
  });

  it('wires the new sheet into Task 7, reuses controlled desktop fields, and removes the modal', () => {
    expect(browserSource).toContain('MarketplaceFilterSheet');
    expect(browserSource).not.toContain('MobileFilterSheet');
    expect(filtersSource).toContain('<ListingFilterFields');
    expect(filtersSource).toContain('applyMarketplaceFilterDraft');
    expect(filtersSource).toContain('clearMarketplaceFilterDraft');
    expect(filtersSource).toContain('h-11');
    expect(existsSync(resolve(
      process.cwd(),
      'src/components/marketplace/mobile-filter-sheet.tsx',
    ))).toBe(false);
  });
});

describe('MarketplaceFilterSheet lifecycle', () => {
  const filters: ListingBrowseParams = {
    minPrice: 100,
    sort: 'price,asc',
    matchCards: ['101:11111111-1111-4111-8111-111111111111:N'],
    matchStrictness: 7,
    attributes: {
      platform: 'STEAM',
      valuable_players_id: '101',
      valuable_players_name: 'Messi',
    },
  };
  const rawQuery = 'q=Messi&minPrice=100&sort=price%2Casc&view=grid&page=4'
    + '&matchCard=101%3A11111111-1111-4111-8111-111111111111%3AN&matchStrictness=7'
    + '&attr.platform=STEAM&attr.valuable_players_id=101&attr.valuable_players_name=Messi';

  function sheet(activeCount = 2) {
    return React.createElement(MarketplaceFilterSheet, { filters, rawQuery, activeCount });
  }

  it('resets on every open; Clear stays local; cancel aborts and restores trigger focus', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await renderWithProviders(sheet());
    const trigger = buttonNamed('Filtrlar', container);
    await click(trigger);
    const minimumPrice = controlNamed('Eng kam narx') as HTMLInputElement;
    expect(minimumPrice.value).toBe('100');
    await input(minimumPrice, '250');
    await click(buttonNamed('Tozalash'));
    expect((controlNamed('Eng kam narx') as HTMLInputElement).value).toBe('');
    expect(routerPush).not.toHaveBeenCalled();

    await input(controlNamed('Eng kam narx') as HTMLInputElement, '300');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const previewSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(previewSignal.aborted).toBe(false);
    await click(buttonNamed('Filtrlarni yopish'));
    expect(previewSignal.aborted).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await click(trigger);
    expect((controlNamed('Eng kam narx') as HTMLInputElement).value).toBe('100');
  });

  it('suppresses invalid previews, associates the error, and disables only invalid Apply', async () => {
    vi.useFakeTimers();
    await renderWithProviders(sheet());
    await click(buttonNamed('Filtrlar', container));
    const minimumPrice = controlNamed('Eng kam narx') as HTMLInputElement;
    await input(minimumPrice, '-1');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(minimumPrice.getAttribute('aria-invalid')).toBe('true');
    expect(minimumPrice.nextElementSibling?.getAttribute('role')).toBe('alert');
    expect(minimumPrice.nextElementSibling?.textContent).toContain('0 dan kam');
    expect(buttonNamed('Natijalarni ko‘rsatish').disabled).toBe(true);
  });

  it('debounces 300ms, aborts stale work, and exposes a stable success CTA', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockImplementationOnce((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }))
      .mockResolvedValueOnce(countResponse(42));

    await renderWithProviders(sheet());
    await click(buttonNamed('Filtrlar', container));
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const staleSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;

    await input(controlNamed('Eng yuqori narx') as HTMLInputElement, '900');
    expect(staleSignal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await Promise.resolve(); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const apply = buttonNamed('42 ta e‘lonni ko‘rsatish');
    expect(apply.disabled).toBe(false);
    expect(apply.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('invalidates a successful preview immediately when a valid draft changes', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(countResponse(42));

    await renderWithProviders(sheet());
    await click(buttonNamed('Filtrlar', container));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await act(async () => { await Promise.resolve(); });
    expect(buttonNamed('42 ta e‘lonni ko‘rsatish')).toBeTruthy();

    await input(controlNamed('Eng yuqori narx') as HTMLInputElement, '900');

    expect(buttonNamed('Natijalarni ko‘rsatish')).toBeTruthy();
    expect(document.body.textContent).not.toContain('42 ta e‘lonni ko‘rsatish');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale preview completion after a newer request succeeds', async () => {
    vi.useFakeTimers();
    const stale = deferred<Response>();
    const current = deferred<Response>();
    fetchMock
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => current.promise);

    await renderWithProviders(sheet());
    await click(buttonNamed('Filtrlar', container));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await input(controlNamed('Eng yuqori narx') as HTMLInputElement, '900');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    await act(async () => {
      current.resolve(countResponse(22));
      await current.promise;
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(buttonNamed('22 ta e‘lonni ko‘rsatish')).toBeTruthy();

    await act(async () => {
      stale.resolve(countResponse(99));
      await stale.promise;
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(buttonNamed('22 ta e‘lonni ko‘rsatish')).toBeTruthy();
    expect(document.body.textContent).not.toContain('99 ta e‘lonni ko‘rsatish');
  });

  it('keeps Apply enabled after preview error, haptics once, navigates once, and preserves state', async () => {
    vi.useFakeTimers();
    const telegram = createTelegramWebApp();
    window.Telegram = { WebApp: telegram.webApp };
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
    await renderWithProviders(sheet());
    await click(buttonNamed('Filtrlar', container));
    await input(controlNamed('Eng kam narx') as HTMLInputElement, '250');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await act(async () => { await Promise.resolve(); });

    const apply = buttonNamed('Natijalarni ko‘rsatish');
    expect(apply.disabled).toBe(false);
    await act(async () => {
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(telegram.webApp.HapticFeedback?.notificationOccurred).toHaveBeenCalledTimes(1);
    expect(telegram.webApp.HapticFeedback?.notificationOccurred).toHaveBeenCalledWith('success');
    const href = routerPush.mock.calls[0]?.[0] as string;
    const params = new URL(href, 'https://example.test').searchParams;
    expect(params.get('q')).toBe('Messi');
    expect(params.get('sort')).toBe('price,asc');
    expect(params.get('view')).toBe('grid');
    expect(params.getAll('matchCard')).toEqual([
      '101:11111111-1111-4111-8111-111111111111:N',
    ]);
    expect(params.get('minPrice')).toBe('250');
    expect(params.has('page')).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('locks swipes while open and native Back cancels with trigger focus restoration', async () => {
    vi.useFakeTimers();
    const telegram = createTelegramWebApp();
    window.Telegram = { WebApp: telegram.webApp };
    await renderWithProviders(sheet());
    const trigger = buttonNamed('Filtrlar', container);
    await click(trigger);
    expect(telegram.webApp.disableVerticalSwipes).toHaveBeenCalledTimes(1);
    await act(async () => telegram.backHandlers.forEach((handler) => handler()));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(telegram.webApp.enableVerticalSwipes).toHaveBeenCalled();
  });
});

describe('desktop detailed filter controller', () => {
  it('keeps Clear local, then applies once while preserving unrelated raw state', async () => {
    const filters: ListingBrowseParams = { minPrice: 100, attributes: { platform: 'STEAM' } };
    const rawQuery = 'q=Messi&minPrice=100&sort=price%2Casc&view=list&page=2'
      + '&matchCard=101%3A11111111-1111-4111-8111-111111111111%3AP';
    await renderWithProviders(React.createElement(ListingFilters, { filters, rawQuery }));
    await click(buttonNamed('Tozalash', container));
    expect(routerPush).not.toHaveBeenCalled();
    expect((controlNamed('Eng kam narx', container) as HTMLInputElement).value).toBe('');
    await click(buttonNamed('Qo‘llash', container));

    expect(routerPush).toHaveBeenCalledTimes(1);
    const href = routerPush.mock.calls[0]?.[0] as string;
    const params = new URL(href, 'https://example.test').searchParams;
    expect(params.get('q')).toBe('Messi');
    expect(params.get('sort')).toBe('price,asc');
    expect(params.get('view')).toBe('list');
    expect(params.getAll('matchCard')).toHaveLength(1);
    expect(params.has('minPrice')).toBe(false);
    expect(params.has('page')).toBe(false);
  });

  it('maps a controlled card removal to null', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(React.createElement(CardPickerField, {
      value: { efhubId: 101, name: 'Messi' },
      onChange,
    })));
    await click(buttonNamed("Messi - o'chirish", container));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

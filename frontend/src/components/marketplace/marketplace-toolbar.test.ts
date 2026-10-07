// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketplaceToolbar } from './marketplace-toolbar';
import { MarketplaceViewMenu, marketplaceViewOptions } from './marketplace-view-menu';
import { SortMenu } from './sort-menu';
import { TelegramBackProvider } from '@/components/telegram/telegram-back-provider';
import type { TelegramWebApp } from '@/lib/types';

const marketplaceSource = (file: string) => readFileSync(
  resolve(process.cwd(), 'src/components/marketplace', file),
  'utf8',
);
const toolbar = marketplaceSource('marketplace-toolbar.tsx');
const view = marketplaceSource('marketplace-view-menu.tsx');
const sort = marketplaceSource('sort-menu.tsx');
const browser = marketplaceSource('marketplace-browser.tsx');
const filters = marketplaceSource('listing-filters.tsx');
const playerDialog = marketplaceSource('player-filter-dialog.tsx');
const globals = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const sortOptions = [
  { id: 'newest', label: 'Eng yangi', href: '/marketplace?sort=createdAt%2Cdesc' },
  { id: 'oldest', label: 'Eng eski', href: '/marketplace?sort=createdAt%2Casc' },
  { id: 'cheapest', label: 'Eng arzon', href: '/marketplace?sort=price%2Casc' },
  { id: 'expensive', label: 'Eng qimmat', href: '/marketplace?sort=price%2Cdesc' },
  { id: 'popular', label: 'Mashhur', href: '/marketplace?sort=favoriteCount%2Cdesc' },
];

let container: HTMLDivElement;
let root: Root;

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
  });
}

async function press(element: Element, key: string) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
  await act(async () => element.dispatchEvent(event));
  return event;
}

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete window.Telegram;
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  vi.restoreAllMocks();
});

describe('marketplace mobile toolbar contract', () => {
  it('keeps the two buyer actions visible and all four targets touch-sized', () => {
    expect(toolbar).toContain('filterTrigger');
    expect(toolbar).toContain('playerTrigger');
    expect(toolbar).toContain('marketplace-toolbar-actions');
    expect(toolbar).toContain('min-h-11');
    expect(toolbar.match(/\[&>button\]:min-h-11/g)).toHaveLength(1);
    expect(view).toContain('min-h-11');
    expect(sort).toContain('min-h-11');
    expect(globals).toContain('display: flex;');
    expect(globals).toContain('gap: 6px;');
  });

  it('removes the legacy filter trigger from the desktop toolbar without a dead flex slot', () => {
    const markup = renderToStaticMarkup(createElement(MarketplaceToolbar, {
      title: 'eFootball akkountlar',
      totalElements: 3,
      filterTrigger: createElement('button', { 'data-filter-trigger': true }, 'Filtrlar'),
      playerTrigger: createElement('button', null, 'O‘yinchilar'),
      sortOptions,
      activeSortId: 'newest',
      activeSortLabel: 'Eng yangi',
      rawQuery: '',
      view: 'auto',
      quickChips: null,
    }));

    expect(markup).toMatch(/class="[^"]*hidden[^"]*"><button data-filter-trigger="true"/);
    expect(browser).toContain('<ListingFilters {...filterProps} />');
  });

  it('exposes Auto, list, and grid as explicit accessible choices', () => {
    expect(marketplaceViewOptions()).toEqual([
      { value: 'auto', label: 'Auto' },
      { value: 'list', label: 'Ro‘yxat' },
      { value: 'grid', label: 'Katak' },
    ]);
    expect(view).toContain('role="menuitemradio"');
    expect(view).toContain('aria-checked={isActive}');
    expect(view).toContain('useTelegramBackLayer');
    expect(view).toContain("kind: 'overlay'");
  });

  it('closes both menus on escape, outside click, native back, and selection', () => {
    for (const source of [view, sort]) {
      expect(source).toContain("document.addEventListener('pointerdown'");
      expect(source).toContain('useTelegramBackLayer');
      expect(source).toContain('setOpen(false)');
    }
    expect(view).toContain("event.key === 'Escape'");
    expect(sort).toContain('useToolbarMenuKeyboardNavigation');
    expect(view).toContain('MarketplacePendingLink');
    expect(sort).toContain('MarketplacePendingLink');
  });

  it('makes every view choice keyboard reachable and restores the trigger on Escape', async () => {
    await act(async () => root.render(createElement(MarketplaceViewMenu, {
      rawQuery: 'q=Messi&matchCard=1%3Ap%3AN',
      view: 'grid',
    })));

    const trigger = container.querySelector('button')!;
    await click(trigger);
    const menu = container.querySelector<HTMLElement>('[role="menu"]')!;
    const items = Array.from(container.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    expect(items).toHaveLength(3);
    expect(items[2]?.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(items[2]);
    expect(menu.className).toContain('overflow-y-auto');
    expect(menu.className).toContain('[@media(max-height:32rem)]:fixed');
    expect(menu.className).toContain('[@media(max-height:32rem)]:left-4');
    expect(menu.className).toContain('[@media(max-height:32rem)]:right-4');
    expect(menu.className).toContain('[@media(max-height:32rem)]:top-[calc(var(--marketplace-sticky-height)+0.5rem)]');
    expect(menu.className).toContain('[@media(max-height:32rem)]:bottom-[calc(var(--marketplace-bottom-bar-height)+0.5rem)]');
    expect(menu.className).toContain('[@media(max-height:32rem)]:max-h-none');

    await press(items[2], 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    await press(items[0], 'End');
    expect(document.activeElement).toBe(items[2]);
    await press(items[2], 'Home');
    expect(document.activeElement).toBe(items[0]);
    await press(items[0], 'ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    await press(items[2], 'Escape');
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('shows all sort choices without an internal scroll area and closes on Tab/outside pointer', async () => {
    await act(async () => root.render(createElement(SortMenu, {
      options: sortOptions,
      activeId: 'cheapest',
      compact: true,
    })));

    const trigger = container.querySelector('button')!;
    await click(trigger);
    let menu = container.querySelector<HTMLElement>('[role="menu"]')!;
    let items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    expect(items).toHaveLength(5);
    expect(items[2]?.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(items[2]);
    expect(menu.className).not.toMatch(/overflow-y-auto|max-h-|\]:fixed|\]:bottom-/);

    await press(items[2], 'ArrowDown');
    expect(document.activeElement).toBe(items[3]);
    await press(items[3], 'ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    await press(items[2], 'Home');
    expect(document.activeElement).toBe(items[0]);
    await press(items[0], 'End');
    expect(document.activeElement).toBe(items[4]);

    const tab = await press(items[4], 'Tab');
    expect(tab.defaultPrevented).toBe(false);
    expect(container.querySelector('[role="menu"]')).toBeNull();

    await click(trigger);
    menu = container.querySelector<HTMLElement>('[role="menu"]')!;
    items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    await act(async () => outside.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('closes a view menu on native Back and restores its trigger focus', async () => {
    const handlers = new Set<() => void>();
    const webApp = {
      initData: 'fixture',
      BackButton: {
        isVisible: false,
        show: vi.fn(),
        hide: vi.fn(),
        onClick: vi.fn((handler: () => void) => { handlers.add(handler); }),
        offClick: vi.fn((handler: () => void) => { handlers.delete(handler); }),
      },
      disableVerticalSwipes: vi.fn(),
      enableVerticalSwipes: vi.fn(),
    } as unknown as TelegramWebApp;
    window.Telegram = { WebApp: webApp };

    await act(async () => root.render(createElement(
      TelegramBackProvider,
      null,
      createElement(MarketplaceViewMenu, { rawQuery: '', view: 'auto' }),
    )));
    const trigger = container.querySelector('button')!;
    await click(trigger);
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => handlers.forEach((handler) => handler()));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('renders separate buyer-action counts and an accessible result heading', () => {
    const markup = renderToStaticMarkup(createElement(MarketplaceToolbar, {
      title: 'eFootball akkountlar',
      totalElements: 124,
      filterTrigger: createElement('button', null, 'Filtrlar', createElement('b', null, '3')),
      playerTrigger: createElement('button', null, 'O‘yinchilar', createElement('b', null, '7')),
      sortOptions: [{ id: 'newest', label: 'Eng yangi', href: '/marketplace?sort=new' }],
      activeSortId: 'newest',
      activeSortLabel: 'Eng yangi',
      rawQuery: 'q=Messi&matchCard=1%3Ap%3AN&matchCard=2%3Ap2%3AP',
      view: 'auto',
      quickChips: null,
    }));

    expect(markup).toContain('Filtrlar');
    expect(markup).toContain('O‘yinchilar');
    expect(markup).toContain('124 ta e‘lon');
    expect(markup).toContain('id="marketplace-results-heading"');
    expect(markup).toContain('tabindex="-1"');
    expect(browser).toContain('<MarketplaceResultsRegion>');
    expect(toolbar).toContain('aria-labelledby="marketplace-results-heading"');
    expect(toolbar).toContain('aria-busy={navigation?.pending || undefined}');
  });

  it('removes the old header, view links, and player summary banner', () => {
    expect(browser).not.toContain('function BrowseHeader');
    expect(browser).not.toContain('LayoutGrid');
    expect(browser).not.toContain('strictnessLabel');
    expect(filters).toContain('MarketplacePendingLink');
    expect(filters).toContain('telegramHaptic');
    expect(filters).toContain('filter.id === activeFilter) return');
    expect(playerDialog).toContain('<span>O‘yinchilar</span>');
  });
});

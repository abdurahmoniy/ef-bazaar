// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardPicker, type PlayerCard } from './card-picker';

let root: Root;
let host: HTMLDivElement;
let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
const cards: PlayerCard[] = Array.from({ length: 20 }, (_, index) => ({
  efhubId: index + 1, playerId: `player-${index}`, name: `Messi ${index + 1}`, maxOverallRating: 106,
}));
const originalWidth = window.innerWidth;
const originalViewport = window.visualViewport;

function Harness({ max = 30 }: { max?: number }) {
  const [value, onChange] = useState<PlayerCard[]>([]);
  return createElement(CardPicker, {
    id: 'valuable-players', mode: 'multi', max, selectedVariant: 'tile', showMetaShortcut: false, value, onChange,
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: window.innerWidth < 768, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => cards }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport });
});

async function openPicker(max = 30) {
  await act(async () => root.render(createElement(Harness, { max })));
  const trigger = host.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
  expect(trigger).not.toBeNull();
  await act(async () => trigger!.click());
  return trigger!;
}

async function search() {
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Messi');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  return input;
}

describe('mobile player picker', () => {
  it('opens a focus-managed search panel within the keyboard-visible viewport', async () => {
    await openPicker();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(dialog.querySelector('input'));
    await act(async () => {
      viewport.height = 410;
      viewport.offsetTop = 55;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(dialog.style.height).toBe('410px');
    expect(dialog.style.top).toBe('55px');
    const results = dialog.querySelector('[role="listbox"]')!;
    expect(results.className).toContain('min-h-0');
    expect(results.className).toContain('overflow-y-auto');
    expect(results.className).not.toContain('absolute');
  });

  it('keeps search and results available after selecting a card, then returns focus on Done', async () => {
    const trigger = await openPicker();
    const input = await search();
    const results = document.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(results).toHaveLength(20);
    await act(async () => results[0].click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(input.value).toBe('Messi');
    expect(document.activeElement).toBe(input);
    expect(results[0].disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('1 / 30');
    const done = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Tayyor')!;
    await act(async () => done.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(host.textContent).toContain('Messi 1');
  });

  it('closes with Escape and retains the listing form selection', async () => {
    const trigger = await openPicker();
    await search();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    // Radix restores focus after the closing focus scope has unmounted.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the inline search on desktop', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    await act(async () => root.render(createElement(Harness)));
    expect(host.querySelector('input[role="combobox"]')).not.toBeNull();
    expect(host.querySelector('button[aria-haspopup="dialog"]')).toBeNull();
  });

  it('returns focus to a removal control when the selection limit disables search', async () => {
    await openPicker(1);
    await search();
    await act(async () => document.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    const done = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Tayyor')!;
    await act(async () => done.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.activeElement?.getAttribute('aria-label')).toBe("Messi 1 - o'chirish");
  });
});

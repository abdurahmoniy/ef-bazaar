// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeScript, THEME_STORAGE_KEY } from './theme-script';
import { ThemeToggle } from './theme-toggle';

let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.head.innerHTML = '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#090910">';
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container.remove();
  document.head.innerHTML = '';
  document.documentElement.classList.remove('dark');
  localStorage.clear();
  vi.unstubAllGlobals();
});
function expectChrome(dark: boolean) {
  expect(document.documentElement.classList.contains('dark')).toBe(dark);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    expect(meta.getAttribute('content')).toBe(dark ? '#090910' : '#ffffff');
  }
}
function initialize() {
  const script = ThemeScript().props.dangerouslySetInnerHTML.__html;
  window.eval(script);
}
describe('webmail browser chrome', () => {
  it.each(['dark', 'light'])('uses the saved %s preference before hydration even when the OS disagrees', (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: theme === 'light' })));
    initialize();
    expectChrome(theme === 'dark');
  });
  it('uses the system theme when there is no saved preference', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    initialize();
    expectChrome(true);
  });
  it('updates the browser chrome with each explicit theme toggle', async () => {
    initialize();
    root = createRoot(container);
    await act(async () => root!.render(createElement(ThemeToggle)));
    await act(async () => container.querySelector('button')!.click());
    expectChrome(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    await act(async () => container.querySelector('button')!.click());
    expectChrome(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});

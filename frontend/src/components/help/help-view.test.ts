// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HelpView } from './help-view';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('HelpView', () => {
  it('renders search bar, categories, and initial help items', async () => {
    await act(async () => {
      root.render(createElement(HelpView));
    });

    expect(container.textContent).toContain('Yordam markazi & Qo‘llanma');
    expect(container.querySelector('input[placeholder*="Garov"]')).not.toBeNull();
    expect(container.textContent).toContain('Boshlash');
    expect(container.textContent).toContain('Xavfsiz savdo va Garov');
  });

  it('filters items when search input is typed', async () => {
    await act(async () => {
      root.render(createElement(HelpView));
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();

    await act(async () => {
      input.value = 'konami';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Konami ID va Pochta almashtirish');
  });

  it('filters items by category click', async () => {
    await act(async () => {
      root.render(createElement(HelpView));
    });

    const safetyCategoryBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Xavfsiz savdo va Garov')
    );
    expect(safetyCategoryBtn).toBeDefined();

    await act(async () => {
      safetyCategoryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Garov (Xavfsiz bitim) tizimi');
    expect(container.textContent).toContain('Firibgarlardan saqlanish');
  });

  it('toggles accordion items expansion', async () => {
    await act(async () => {
      root.render(createElement(HelpView, { initialQuery: 'tangalar' }));
    });

    const questionButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Nega Android va iOS tangalari alohida')
    );
    expect(questionButton).toBeDefined();

    await act(async () => {
      questionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Konami qoidalariga ko‘ra');
  });
});

// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HelpView } from './help-view';
import type { Guide } from '@/lib/guides';

let container: HTMLDivElement;
let root: Root;

const MOCK_GUIDES: Guide[] = [
  {
    id: 'g-1',
    title: 'Garov tizimi qanday ishlaydi',
    description: 'Xavfsiz savdo va escrow bitimi videosi',
    videoFileId: 'v-safety-1',
    category: 'safety',
    createdAt: '2026-09-01T12:00:00Z',
  },
  {
    id: 'g-2',
    title: 'Akkountni qanday sotish kerak',
    description: 'E‘lon berish va narx belgilash videosi',
    videoFileId: 'v-seller-1',
    category: 'seller',
    createdAt: '2026-09-02T12:00:00Z',
  },
  {
    id: 'g-3',
    title: 'Hamyonni to‘ldirish va yechish',
    description: 'Uzcard va Humo orqali to‘lov qilish videosi',
    videoFileId: 'v-wallet-1',
    category: 'wallet',
    createdAt: '2026-09-03T12:00:00Z',
  },
];

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
      root.render(createElement(HelpView, { initialGuides: MOCK_GUIDES }));
    });

    expect(container.textContent).toContain('Yordam markazi & Qo‘llanma');
    expect(container.querySelector('input[placeholder*="Garov"]')).not.toBeNull();
    expect(container.textContent).toContain('Boshlash');
    expect(container.textContent).toContain('Xavfsiz savdo va Garov');
    expect(container.textContent).toContain('Video qo‘llanmalar');
  });

  it('renders video guides and filters by category', async () => {
    await act(async () => {
      root.render(createElement(HelpView, { initialGuides: MOCK_GUIDES }));
    });

    // In 'all' category, all mock guides should be visible
    expect(container.textContent).toContain('Garov tizimi qanday ishlaydi');
    expect(container.textContent).toContain('Akkountni qanday sotish kerak');
    expect(container.textContent).toContain('Hamyonni to‘ldirish va yechish');

    // Click 'Xavfsiz savdo va Garov'
    const safetyCategoryBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Xavfsiz savdo va Garov'),
    );
    expect(safetyCategoryBtn).toBeDefined();

    await act(async () => {
      safetyCategoryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Only safety video guide should be visible now
    expect(container.textContent).toContain('Garov tizimi qanday ishlaydi');
    expect(container.textContent).not.toContain('Akkountni qanday sotish kerak');
  });

  it('filters video guides and articles when search input is typed', async () => {
    await act(async () => {
      root.render(createElement(HelpView, { initialGuides: MOCK_GUIDES }));
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, 'sotish');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Akkountni qanday sotish kerak');
    expect(container.textContent).not.toContain('Hamyonni to‘ldirish va yechish');
  });

  it('opens video player modal when video card is clicked', async () => {
    await act(async () => {
      root.render(createElement(HelpView, { initialGuides: MOCK_GUIDES }));
    });

    const playButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Videoni ko‘rish'),
    );
    expect(playButton).toBeDefined();

    await act(async () => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Modal dialog should be rendered
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Garov tizimi qanday ishlaydi');
    expect(dialog?.querySelector('video')).not.toBeNull();

    // Close modal
    const closeButton = dialog?.querySelector('button[aria-label="Yopish"]');
    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('toggles accordion items expansion', async () => {
    await act(async () => {
      root.render(createElement(HelpView, { initialQuery: 'tangalar' }));
    });

    const questionButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Nega Android va iOS tangalari alohida'),
    );
    expect(questionButton).toBeDefined();

    await act(async () => {
      questionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Konami qoidalariga ko‘ra');
  });
});

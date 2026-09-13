// @vitest-environment jsdom

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEEDED_LISTING_ATTRIBUTE_DEFINITIONS } from '@/lib/listing-form-data';

const { push, refresh, nativeButton } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  nativeButton: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock('@/hooks/use-telegram-main-button', () => ({
  useTelegramMainButton: nativeButton,
}));
vi.mock('@/components/marketplace/card-picker', () => ({
  CardPicker: () => null,
}));
vi.mock('@/lib/payment-client', () => ({
  getPublicTradeCommissionConfig: () => Promise.resolve(null),
}));

vi.mock('@/app/auth/actions', () => ({ linkTelegramAction: vi.fn() }));
import { ListingForm } from './listing-form';

describe('ListingForm mobile zooming and keyboard protection', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' }));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders StepNav inside a MeasuredBottomBar without hideOnKeyboard so action bar remains visible on keyboard focus', async () => {
    await act(async () => {
      root.render(
        React.createElement(ListingForm, {
          attributeDefinitions: SEEDED_LISTING_ATTRIBUTE_DEFINITIONS,
        }),
      );
    });

    const bottomBar = host.querySelector('[class*="fixed inset-x-0 bottom-0"]');
    expect(bottomBar).not.toBeNull();
    // Verify hideOnKeyboard is disabled so action bar stays visible when mobile keyboard opens
    expect(bottomBar?.className).not.toContain('transition-all');
    expect(bottomBar?.getAttribute('data-keyboard-hidden')).toBeNull();
  });

  it('ensures description textarea has text-base on mobile to prevent iOS Safari auto-zoom', async () => {
    await act(async () => {
      root.render(
        React.createElement(ListingForm, {
          attributeDefinitions: SEEDED_LISTING_ATTRIBUTE_DEFINITIONS,
        }),
      );
    });

    // Move to step 2 (basics)
    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['test'], 'test.png', { type: 'image/png' })],
    });
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const nextBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Davom etish',
    )!;
    await act(async () => {
      nextBtn.click();
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('#description');
    expect(textarea).not.toBeNull();
    expect(textarea?.className).toContain('text-base');
    expect(textarea?.className).not.toContain('text-xs');
  });
});

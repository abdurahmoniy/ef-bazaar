// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformCard } from './platform-card';
import type { PlatformCardResponse } from '@/lib/payment-types';

/** Explicit escape — never assert a literal invisible character. See money.test.ts. */
const NBSP = '\u00A0';

const baseCard: PlatformCardResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  maskedPan: '**** **** **** 4321',
  last4: '4321',
  holderName: 'EFBAZAAR MCHJ',
  expiryMonth: 3,
  expiryYear: 2029,
  brand: 'HUMO',
  displayOrder: 1,
  active: true,
};

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
  vi.restoreAllMocks();
});

type Handlers = Partial<Parameters<typeof PlatformCard>[0]>;

async function render(card: PlatformCardResponse, props: Handlers = {}) {
  await act(async () => root.render(createElement(PlatformCard, {
    card,
    onDeactivate: () => {},
    onActivate: () => {},
    ...props,
  })));
}

function buttonLabelled(label: string) {
  return [...container.querySelectorAll('button')]
    .find((b) => b.textContent === label || b.getAttribute('aria-label') === label)!;
}

describe('PlatformCard', () => {
  it('shows the masked number, the brand, the holder and the expiry', async () => {
    await render(baseCard);
    const text = container.textContent ?? '';
    expect(text).toContain('**** **** **** 4321');
    expect(text).toContain('HUMO');
    expect(text).toContain('EFBAZAAR MCHJ');
    // Zero-padded month, two-digit year — the way it is printed on the card.
    expect(text).toContain('03/29');
  });

  it('spells Mastercard out, as the brand enum abbreviates it', async () => {
    await render({ ...baseCard, brand: 'MC' });
    expect(container.textContent).toContain('Mastercard');
  });

  it("says the balance is unknown rather than showing 0 so'm", async () => {
    await render(baseCard);
    expect(container.textContent).toContain("Qoldiq hali ma'lum emas");
    expect(container.textContent).not.toContain('0 so');
  });

  /** A genuinely empty card is not the same as one nobody has paid yet. */
  it('shows a real zero balance as zero', async () => {
    await render({ ...baseCard, balanceTiyin: 0 });
    expect(container.textContent).toContain(`0 so'm`);
    expect(container.textContent).not.toContain("Qoldiq hali ma'lum emas");
  });

  it('formats an observed balance', async () => {
    await render({ ...baseCard, balanceTiyin: 12_345_600 });
    expect(container.textContent).toContain(`123${NBSP}456 so'm`);
  });

  it('shows the queue position it is given, not the stale server order', async () => {
    await render({ ...baseCard, displayOrder: 7 }, { position: 2 });
    expect(container.textContent).toContain('#2');
    expect(container.textContent).not.toContain('#7');
  });

  it('marks a deactivated card and offers to switch it back on', async () => {
    const onActivate = vi.fn();
    await render({ ...baseCard, active: false }, { onActivate });
    expect(container.textContent).toContain('Faol emas');

    await act(async () => buttonLabelled('Yoqish').click());
    expect(onActivate).toHaveBeenCalledWith(baseCard.id);
  });

  it('deactivates an active card', async () => {
    const onDeactivate = vi.fn();
    await render(baseCard, { onDeactivate });

    await act(async () => buttonLabelled("O'chirish").click());
    expect(onDeactivate).toHaveBeenCalledWith(baseCard.id);
  });

  it('offers move arrows only when the list supplies a handler', async () => {
    await render(baseCard);
    expect(buttonLabelled('Yuqoriga')).toBeUndefined();
    expect(buttonLabelled('Pastga')).toBeUndefined();

    const onMoveUp = vi.fn();
    await render(baseCard, { onMoveUp });
    await act(async () => buttonLabelled('Yuqoriga').click());
    expect(onMoveUp).toHaveBeenCalledWith(baseCard.id);
    expect(buttonLabelled('Pastga')).toBeUndefined();
  });

  it('locks every button while an action is in flight', async () => {
    await render(baseCard, { busy: true, onMoveUp: () => {}, onMoveDown: () => {} });
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.length).toBe(3);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});

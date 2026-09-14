// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardHistory } from './card-history';
import type { CardMovement } from '@/lib/payment-types';

const clientMocks = vi.hoisted(() => ({ listCardHistory: vi.fn() }));
vi.mock('@/lib/payment-admin-client', () => clientMocks);

/** Explicit escape — never assert a literal invisible character. See money.test.ts. */
const NBSP = '\u00A0';

const NOW = new Date('2026-09-11T06:00:00Z');

let nextId = 0;
function movement(patch: Partial<CardMovement> = {}): CardMovement {
  nextId += 1;
  return {
    id: `m-${nextId}`,
    direction: 'IN',
    cardLast4: '0101',
    amountTiyin: 100_000,
    observedAt: '2026-09-11T05:00:00Z',
    ...patch,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  clientMocks.listCardHistory.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(initialMovements: CardMovement[]) {
  await act(async () =>
    root.render(createElement(CardHistory, { initialMovements, now: NOW })));
}

function chip(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent === label);
}

describe('CardHistory', () => {
  it('says what the list is and where it came from', async () => {
    await render([movement()]);
    expect(container.textContent).toContain('Karta harakatlari');
    expect(container.textContent).toContain('bank aytgan haqiqat');
  });

  it('shows a credit as a plus and a debit as a minus', async () => {
    await render([
      movement({ direction: 'IN', amountTiyin: 700_000 }),
      movement({ direction: 'OUT', amountTiyin: 1_000_000 }),
    ]);

    const text = container.textContent ?? '';
    expect(text).toContain(`+7${NBSP}000`);
    expect(text).toContain(`−10${NBSP}000`);
  });

  /**
   * The direction must survive colour being unavailable — a colourblind
   * reader, a screenshot in greyscale, a screen reader.
   */
  it('names the direction in text, not only in colour', async () => {
    await render([movement({ direction: 'OUT' })]);
    expect(container.querySelector('.sr-only')?.textContent).toContain('Chiqim');
  });

  it('groups movements under the Tashkent day they happened on', async () => {
    await render([
      // 20:34 UTC is 01:34 on the 11th in Tashkent — the clock the bank printed.
      movement({ observedAt: '2026-09-10T20:34:00Z' }),
      movement({ observedAt: '2026-09-09T10:00:00Z' }),
    ]);

    const text = container.textContent ?? '';
    expect(text).toContain('Bugun');
    expect(text).toContain('9 sentabr');
    expect(text).toContain('01:34');
  });

  it('totals each day separately', async () => {
    await render([
      movement({ direction: 'IN', amountTiyin: 700_000, observedAt: '2026-09-11T05:00:00Z' }),
      movement({ direction: 'OUT', amountTiyin: 200_000, observedAt: '2026-09-11T04:00:00Z' }),
    ]);

    const text = container.textContent ?? '';
    expect(text).toContain(`Kirim 7${NBSP}000`);
    expect(text).toContain(`Chiqim 2${NBSP}000`);
  });

  it("shows the bank's own words for where a debit went", async () => {
    await render([movement({ direction: 'OUT', description: 'Openbank P2P HUMO OT' })]);
    expect(container.textContent).toContain('Openbank P2P HUMO OT');
  });

  it('flags a credit nobody has accounted for', async () => {
    await render([movement({ creditStatus: 'UNMATCHED' })]);
    expect(container.textContent).toContain('Tekshirilmagan');
  });

  it('leaves an ordinary movement unflagged', async () => {
    await render([movement({ creditStatus: 'MATCHED' })]);
    expect(container.textContent).not.toContain('Tekshirilmagan');
  });

  it('offers no card filter when every movement is on one card', async () => {
    await render([movement({ cardLast4: '0101' }), movement({ cardLast4: '0101' })]);
    expect(chip('Barchasi')).toBeUndefined();
  });

  it('re-reads the history narrowed to the card that was picked', async () => {
    clientMocks.listCardHistory.mockResolvedValue([
      movement({ cardLast4: '0202', amountTiyin: 550_000 }),
    ]);
    await render([movement({ cardLast4: '0101' }), movement({ cardLast4: '0202' })]);

    await act(async () => chip('•••• 0202')!.click());

    expect(clientMocks.listCardHistory).toHaveBeenCalledWith('0202');
    expect(container.textContent).toContain(`5${NBSP}500`);
  });

  /**
   * Narrowing must not remove the other chips — that would leave no way back
   * to the full list.
   */
  it('keeps every card chip after narrowing to one', async () => {
    clientMocks.listCardHistory.mockResolvedValue([movement({ cardLast4: '0202' })]);
    await render([movement({ cardLast4: '0101' }), movement({ cardLast4: '0202' })]);

    await act(async () => chip('•••• 0202')!.click());

    expect(chip('•••• 0101')).toBeDefined();
    expect(chip('Barchasi')).toBeDefined();
  });

  it('marks which filter is active', async () => {
    clientMocks.listCardHistory.mockResolvedValue([]);
    await render([movement({ cardLast4: '0101' }), movement({ cardLast4: '0202' })]);

    expect(chip('Barchasi')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => chip('•••• 0202')!.click());
    expect(chip('•••• 0202')!.getAttribute('aria-pressed')).toBe('true');
    expect(chip('Barchasi')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the failure and keeps what is on screen when a re-read fails', async () => {
    clientMocks.listCardHistory.mockRejectedValue(new Error('tarmoq'));
    await render([movement({ cardLast4: '0101' }), movement({ cardLast4: '0202' })]);

    await act(async () => chip('•••• 0202')!.click());

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('tarmoq');
    expect(container.querySelectorAll('li').length).toBe(2);
  });

  it('explains an empty history rather than showing a blank box', async () => {
    await render([]);
    expect(container.textContent).toContain("Hozircha harakat yo'q");
  });
});

// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformCardList } from './platform-card-list';
import type { CardThroughputRow, PlatformCardResponse } from '@/lib/payment-types';

const clientMocks = vi.hoisted(() => ({
  listPlatformCards: vi.fn(),
  activateCard: vi.fn(),
  deactivateCard: vi.fn(),
  deletePlatformCard: vi.fn(),
  reorderCards: vi.fn(),
  createPlatformCard: vi.fn(),
}));

vi.mock('@/lib/payment-admin-client', () => clientMocks);

function card(
  id: string,
  displayOrder: number,
  active = true,
): PlatformCardResponse {
  return {
    id,
    maskedPan: `**** **** **** 000${displayOrder}`,
    last4: `000${displayOrder}`,
    holderName: 'EFBAZAAR MCHJ',
    expiryMonth: 12,
    expiryYear: 2029,
    brand: 'HUMO',
    displayOrder,
    active,
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
  Object.values(clientMocks).forEach((mock) => mock.mockReset());
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(
  initialCards: PlatformCardResponse[],
  throughput?: CardThroughputRow[],
) {
  await act(async () =>
    root.render(createElement(PlatformCardList, { initialCards, throughput })));
}

function buttonLabelledEndingWith(suffix: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button[aria-label]')]
    .find((b) => b.getAttribute('aria-label')!.endsWith(suffix));
}

function articles() {
  return [...container.querySelectorAll('article')];
}

/**
 * Every reorder button names its own card, so a screen-reader user on a grid
 * hears which one moves — hence the prefix match rather than an equality one.
 */
function arrows(direction: 'yuqoriga' | 'pastga') {
  return [...container.querySelectorAll<HTMLButtonElement>('button[aria-label]')].filter((b) =>
    b.getAttribute('aria-label')!.endsWith(`kartasini ${direction} surish`),
  );
}

describe('PlatformCardList', () => {
  it('warns when there is no active card at all', async () => {
    await render([]);
    expect(container.textContent).toContain("Faol karta yo'q");
  });

  it('shows the active cards in order, numbered by position', async () => {
    await render([card('b', 2), card('a', 1)]);
    const positions = articles().map((a) => a.textContent?.match(/#\d/)?.[0]);
    expect(positions).toEqual(['#1', '#2']);
    expect(articles()[0].textContent).toContain('0001');
  });

  it('keeps deactivated cards in their own section', async () => {
    await render([card('a', 1), card('x', 2, false)]);
    expect(container.textContent).toContain('Faolsizlantirilgan kartalar (1)');
    expect(container.textContent).toContain('Faol kartalar (1)');
  });

  it('gives the first card no up arrow and the last no down arrow', async () => {
    await render([card('a', 1), card('b', 2)]);
    expect(arrows('yuqoriga').length).toBe(1);
    expect(arrows('pastga').length).toBe(1);
  });

  /**
   * The backend rewrites display_order for the whole active set in one call and
   * rejects a partial list, so the payload is every active id — and only the
   * active ones.
   */
  it('posts the complete active order when a card is moved up', async () => {
    clientMocks.reorderCards.mockResolvedValue(undefined);
    clientMocks.listPlatformCards.mockResolvedValue([card('b', 1), card('a', 2)]);
    await render([card('a', 1), card('b', 2), card('x', 3, false)]);

    await act(async () => arrows('yuqoriga')[0].click());

    expect(clientMocks.reorderCards).toHaveBeenCalledWith(['b', 'a']);
    expect(clientMocks.listPlatformCards).toHaveBeenCalled();
    expect(articles()[0].textContent).toContain('0001');
  });

  it('re-reads the list after a deactivation', async () => {
    clientMocks.deactivateCard.mockResolvedValue(undefined);
    clientMocks.listPlatformCards.mockResolvedValue([card('a', 1, false)]);
    await render([card('a', 1)]);

    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Faolsizlantirish')!.click();
    });

    expect(clientMocks.deactivateCard).toHaveBeenCalledWith('a');
    expect(container.textContent).toContain("Faol karta yo'q");
  });

  it('activates a deactivated card', async () => {
    clientMocks.activateCard.mockResolvedValue(undefined);
    clientMocks.listPlatformCards.mockResolvedValue([card('x', 1)]);
    await render([card('x', 1, false)]);

    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Yoqish')!.click();
    });

    expect(clientMocks.activateCard).toHaveBeenCalledWith('x');
  });

  it('shows the failure and restores the server order when a reorder is refused', async () => {
    clientMocks.reorderCards.mockRejectedValue(new Error('Tartib qabul qilinmadi'));
    clientMocks.listPlatformCards.mockResolvedValue([card('a', 1), card('b', 2)]);
    await render([card('a', 1), card('b', 2)]);

    await act(async () => arrows('yuqoriga')[0].click());

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe('Tartib qabul qilinmadi');
    // The optimistic swap is gone — the server's order is what is on screen.
    expect(articles()[0].textContent).toContain('0001');
  });

  it('keeps the current list when the re-read itself fails', async () => {
    clientMocks.deactivateCard.mockResolvedValue(undefined);
    clientMocks.listPlatformCards.mockRejectedValue(new Error('tarmoq'));
    await render([card('a', 1)]);

    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Faolsizlantirish')!.click();
    });

    expect(articles().length).toBe(1);
  });
  it('deletes a card once the confirmation is clicked through', async () => {
    clientMocks.deletePlatformCard.mockResolvedValue(undefined);
    clientMocks.listPlatformCards.mockResolvedValue([]);
    await render([card('a', 1)]);

    await act(async () => buttonLabelledEndingWith("kartasini butunlay o'chirish")!.click());
    await act(async () => buttonLabelledEndingWith("kartasini o'chirishni tasdiqlash")!.click());

    expect(clientMocks.deletePlatformCard).toHaveBeenCalledWith('a');
    expect(container.textContent).toContain("Faol karta yo'q");
  });

  /**
   * payment-service refuses a card any payment ever named. This component
   * cannot know a card's payment history, so it does not pre-empt that — it
   * shows what the backend said.
   */
  it('shows the backend reason when a delete is refused', async () => {
    clientMocks.deletePlatformCard.mockRejectedValue(
      new Error("Bu karta orqali to'lov o'tgan"),
    );
    clientMocks.listPlatformCards.mockResolvedValue([card('a', 1)]);
    await render([card('a', 1)]);

    await act(async () => buttonLabelledEndingWith("kartasini butunlay o'chirish")!.click());
    await act(async () => buttonLabelledEndingWith("kartasini o'chirishni tasdiqlash")!.click());

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe("Bu karta orqali to'lov o'tgan");
    expect(articles().length).toBe(1);
  });

  it('joins the throughput onto the card it belongs to', async () => {
    await render([card('a', 1), card('b', 2)], [
      { cardId: 'a', throughputTiyin: 900_000, paidInvoices: 4 },
    ]);

    expect(articles()[0].textContent).toContain('Aylanma');
    expect(articles()[0].textContent).toContain('4 ta');
    // Nothing measured for the second card — no bar rather than a zero one.
    expect(articles()[1].textContent).not.toContain('Aylanma');
  });

  /** The analytics read is independent and may fail on its own. */
  it('manages the queue with no throughput data at all', async () => {
    await render([card('a', 1)]);

    expect(articles().length).toBe(1);
    expect(container.textContent).not.toContain('Aylanma');
  });
});

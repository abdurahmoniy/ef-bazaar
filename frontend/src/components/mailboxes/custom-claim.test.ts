// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomClaim } from './custom-claim';
import type { Availability } from '@/lib/custom-mailbox';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  checkAvailability: vi.fn(),
  claimCustomMailbox: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock('@/lib/custom-mailbox-client', () => ({
  checkAvailability: mocks.checkAvailability,
  claimCustomMailbox: mocks.claimCustomMailbox,
  MailboxApiError: class extends Error {},
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const free = (email: string, over: Partial<Availability> = {}): Availability => ({
  email, available: true, reason: null, canClaim: true, claimBlock: null, ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function render(plan: 'STANDARD' | 'PRO' | 'MAX' | 'STAFF' | null) {
  await act(async () => root.render(createElement(CustomClaim, { plan, accountId: null })));
}

async function type(value: string) {
  const input = container.querySelector('input#custom-local') as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

const text = () => container.textContent ?? '';
const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label));

describe('CustomClaim', () => {
  it('checks the name after the user stops typing and offers it', async () => {
    mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz'));
    await render('PRO');

    await type('AliBek1');

    expect(mocks.checkAvailability).toHaveBeenCalledTimes(1);
    expect(mocks.checkAvailability.mock.calls[0].slice(0, 2)).toEqual(['alibek1', 'efbazaar.uz']);
    expect(text()).toContain('Olishingiz mumkin');
    expect(button('Olish')).toBeTruthy();
  });

  it('claims and goes on to linking', async () => {
    mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz'));
    mocks.claimCustomMailbox.mockResolvedValue({ id: 'box-1', email: 'alibek1@efbazaar.uz' });
    await render('PRO');
    await type('alibek1');

    await act(async () => button('Olish')!.click());

    expect(mocks.claimCustomMailbox).toHaveBeenCalledWith('alibek1', 'efbazaar.uz');
    expect(mocks.push).toHaveBeenCalledWith('/mailboxes/custom/box-1/link');
  });

  it('explains a bad name without asking the server', async () => {
    await render('PRO');
    await type('ali');

    expect(mocks.checkAvailability).not.toHaveBeenCalled();
    expect(text()).toContain('5–24 belgi, faqat lotin harf va raqam');
  });

  it('sells efootball.uz below Aristokrat', async () => {
    mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz'));
    await render('PRO');
    await type('alibek1');

    expect(text()).toContain('alibek1@efootball.uz ni ham olishingiz mumkin');
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
  });

  it('lets Aristokrat pick efootball.uz and re-checks there', async () => {
    mocks.checkAvailability.mockImplementation(async (local: string, domain: string) => free(`${local}@${domain}`));
    await render('MAX');
    await type('alibek1');

    const efootball = Array.from(container.querySelectorAll('[role="radio"]'))
      .find((r) => r.textContent?.includes('efootball.uz')) as HTMLButtonElement;
    await act(async () => efootball.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(mocks.checkAvailability.mock.calls.at(-1)!.slice(0, 2)).toEqual(['alibek1', 'efootball.uz']);
    expect(text()).not.toContain('ni ham olishingiz mumkin');
  });

  it('sends Jaydari to the plans page instead of claiming', async () => {
    mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz', { canClaim: false, claimBlock: 'NO_SLOT' }));
    await render('STANDARD');
    await type('alibek1');

    const upgrade = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Boyvachcha tarifida oling'));
    expect(upgrade?.getAttribute('href')).toBe('/plans');
    expect(button('Olish')).toBeUndefined();
  });
});

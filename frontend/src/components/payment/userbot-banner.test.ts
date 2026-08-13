// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UserbotBanner } from './userbot-banner';
import type { UserbotStatusResponse } from '@/lib/payment-types';

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

async function render(status: UserbotStatusResponse) {
  await act(async () => root.render(createElement(UserbotBanner, { status })));
}

describe('UserbotBanner', () => {
  it('says the observer is alive and when it last checked in', async () => {
    await render({ healthy: true, lastSeenAt: '2026-08-13T09:30:00Z', timeoutSeconds: 300 });
    expect(container.textContent).toContain("To'lov kuzatuvchisi ishlayapti");
    // Tashkent is UTC+5, so 09:30Z reads as 14:30.
    expect(container.textContent).toContain('14:30');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not invent a timestamp when there has never been a signal', async () => {
    await render({ healthy: true, timeoutSeconds: 300 });
    expect(container.textContent).toContain("To'lov kuzatuvchisi ishlayapti");
    expect(container.textContent).not.toContain('oxirgi signal');
  });

  it('raises an alert when the observer is down', async () => {
    await render({ healthy: false, lastSeenAt: '2026-08-13T09:30:00Z', timeoutSeconds: 300 });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("To'lov kuzatuvchisi javob bermayapti");
    expect(container.textContent).toContain('qabul qilinmayapti');
    expect(container.textContent).toContain('Oxirgi signal');
  });

  /**
   * The load-bearing sentence. A red banner without it reads like money is
   * disappearing; in fact every unmatched credit queues up and can be
   * attributed by hand.
   */
  it('promises that incoming money is not lost, only unattributed', async () => {
    await render({ healthy: false, timeoutSeconds: 300 });
    expect(container.textContent).toContain(
      "Kelgan pullar yo'qolmaydi — ular tekshirilmagan tushumlar ro'yxatiga tushadi.",
    );
  });

  it('says so plainly when the observer has never reported at all', async () => {
    await render({ healthy: false, timeoutSeconds: 300 });
    expect(container.textContent).toContain('Hech qanday signal olinmadi');
    expect(container.textContent).not.toContain('Oxirgi signal');
  });
});

// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TipCallout } from './tip-callout';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('TipCallout', () => {
  it('renders default tip variant with title and content', async () => {
    await act(async () => {
      root.render(
        createElement(
          TipCallout,
          { title: 'Muhim maslahat' },
          'Yulduz kartalarni to‘g‘ri tanlang.'
        )
      );
    });

    expect(container.textContent).toContain('Muhim maslahat');
    expect(container.textContent).toContain('Yulduz kartalarni to‘g‘ri tanlang.');
  });

  it('renders security variant with custom badge', async () => {
    await act(async () => {
      root.render(
        createElement(
          TipCallout,
          { variant: 'security' },
          'Parollarni ochiq chatda yozmang.'
        )
      );
    });

    expect(container.textContent).toContain('Xavfsizlik');
    expect(container.textContent).toContain('Parollarni ochiq chatda yozmang.');
  });

  it('renders learn more link when provided', async () => {
    await act(async () => {
      root.render(
        createElement(
          TipCallout,
          {
            learnMoreHref: '/help#safety',
            learnMoreLabel: 'Qoidalarni o‘qish',
          },
          'Garov haqida ma‘lumot.'
        )
      );
    });

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/help#safety');
    expect(link?.textContent).toContain('Qoidalarni o‘qish');
  });

  it('handles dismiss action and persists key in localStorage', async () => {
    await act(async () => {
      root.render(
        createElement(
          TipCallout,
          {
            dismissible: true,
            dismissKey: 'test_tip_1',
          },
          'Yopilishi mumkin bo‘lgan maslahat'
        )
      );
    });

    expect(container.textContent).toContain('Yopilishi mumkin');
    const closeButton = container.querySelector('button[aria-label="Yopish"]');
    expect(closeButton).not.toBeNull();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toBe('');
    expect(localStorage.getItem('tip_dismissed_test_tip_1')).toBe('true');
  });
});

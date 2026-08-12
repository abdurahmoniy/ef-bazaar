// @vitest-environment jsdom

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

import {
  MarketplaceNavigationProvider,
  MarketplacePendingLink,
  shouldInterceptMarketplaceLinkClick,
  type MarketplaceLinkClickDecision,
} from './marketplace-navigation';

const baseDecision: MarketplaceLinkClickDecision = {
  navigationAvailable: true,
  external: false,
  defaultPrevented: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  button: 0,
};

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe('marketplace pending link decision', () => {
  it('intercepts absent, empty, and case-insensitive _self targets', () => {
    for (const target of [undefined, '', '_self', '_SELF', '_SeLf']) {
      expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, target }), target).toBe(true);
    }
  });

  it('leaves every other non-empty browsing context to the browser', () => {
    for (const target of ['_blank', '_BLANK', '_parent', '_top', 'results-pane', ' _self']) {
      expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, target }), target).toBe(false);
    }
  });

  it('preserves navigation, download, cancellation, modifier, and button guards', () => {
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, navigationAvailable: false }))
      .toBe(false);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, external: true })).toBe(false);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, download: true })).toBe(false);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, download: 'listing.json' }))
      .toBe(false);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, download: false })).toBe(true);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, defaultPrevented: true }))
      .toBe(false);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, metaKey: true })).toBe(false);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, ctrlKey: true })).toBe(false);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, shiftKey: true })).toBe(false);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, altKey: true })).toBe(false);
    expect(shouldInterceptMarketplaceLinkClick({ ...baseDecision, button: 1 })).toBe(false);
  });
});

describe('MarketplacePendingLink browser behavior', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    routerPush.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  async function clickLink(target?: string) {
    await act(async () => {
      root.render(
        React.createElement(
          MarketplaceNavigationProvider,
          null,
          React.createElement(
            MarketplacePendingLink,
            { href: '#next-results', target },
            'Next results',
          ),
        ),
      );
    });

    const link = container.querySelector('a');
    if (!(link instanceof HTMLAnchorElement)) throw new Error('Expected rendered link');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    await act(async () => link.dispatchEvent(click));
    return click;
  }

  it.each([undefined, '', '_self', '_SELF'])('intercepts internal target %s', async (target) => {
    const click = await clickLink(target);

    expect(click.defaultPrevented).toBe(true);
    expect(routerPush).toHaveBeenCalledWith('#next-results');
  });

  it.each(['_blank', '_BLANK', '_parent', '_top', 'results-pane'])(
    'leaves target %s to native browser navigation',
    async (target) => {
      const click = await clickLink(target);

      expect(click.defaultPrevented).toBe(false);
      expect(routerPush).not.toHaveBeenCalled();
    },
  );

  it('focuses the results heading after an intercepted navigation completes', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          MarketplaceNavigationProvider,
          null,
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              MarketplacePendingLink,
              { href: '#next-results' },
              'Next results',
            ),
            React.createElement(
              'h2',
              { id: 'marketplace-results-heading', tabIndex: -1 },
              'Results',
            ),
          ),
        ),
      );
    });

    const link = container.querySelector('a');
    const heading = container.querySelector('#marketplace-results-heading');
    if (!(link instanceof HTMLAnchorElement) || !(heading instanceof HTMLElement)) {
      throw new Error('Expected navigation link and results heading');
    }

    await act(async () => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(heading);
  });

  it('preserves active dialog focus when pending navigation completes', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          MarketplaceNavigationProvider,
          null,
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              MarketplacePendingLink,
              { href: '#next-results' },
              'Next results',
            ),
            React.createElement(
              'div',
              { role: 'dialog' },
              React.createElement('button', { type: 'button' }, 'Keep focus'),
            ),
            React.createElement(
              'h2',
              { id: 'marketplace-results-heading', tabIndex: -1 },
              'Results',
            ),
          ),
        ),
      );
    });

    const link = container.querySelector('a');
    const dialogButton = container.querySelector('[role="dialog"] button');
    if (!(link instanceof HTMLAnchorElement) || !(dialogButton instanceof HTMLButtonElement)) {
      throw new Error('Expected navigation link and dialog button');
    }
    dialogButton.focus();

    await act(async () => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(dialogButton);
  });
});

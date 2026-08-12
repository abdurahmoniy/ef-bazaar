import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  initialSearchChromeState,
  reduceSearchChrome,
  type SearchChromeState,
} from './marketplace-search-collapse';

describe('marketplace search chrome', () => {
  it('collapses only after threshold plus downward hysteresis', () => {
    let state = initialSearchChromeState(false);
    state = reduceSearchChrome(state, { type: 'scroll', y: 60 });
    expect(state.phase).toBe('expanded');
    state = reduceSearchChrome(state, { type: 'scroll', y: 73 });
    state = reduceSearchChrome(state, { type: 'scroll', y: 98 });
    expect(state.phase).toBe('collapsing');
    expect(reduceSearchChrome(state, { type: 'transitionEnd' }).phase).toBe('compact');
  });

  it('ignores jitter, expands after an upward 24px move, and clamps iOS bounce', () => {
    let state: SearchChromeState = {
      ...initialSearchChromeState(false),
      phase: 'compact' as const,
      lastY: 120,
      direction: 'none' as const,
      directionAnchorY: 120,
    };
    state = reduceSearchChrome(state, { type: 'scroll', y: 112 });
    expect(state.phase).toBe('compact');
    state = reduceSearchChrome(state, { type: 'scroll', y: 94 });
    expect(state.phase).toBe('expanded');
    expect(reduceSearchChrome(state, { type: 'scroll', y: -30 }).lastY).toBe(0);
  });

  it('pins expanded while focused and starts short landscape compact', () => {
    let state = initialSearchChromeState(true);
    expect(state.phase).toBe('compact');
    state = reduceSearchChrome(state, { type: 'focus' });
    state = reduceSearchChrome(state, { type: 'scroll', y: 300 });
    expect(state.phase).toBe('expanded');
    expect(state.focused).toBe(true);
  });

  it('keeps runtime short landscape compact at the top until explicitly opened or focused', () => {
    let state = initialSearchChromeState(false);
    state = reduceSearchChrome(state, { type: 'landscape', short: true });
    expect(state.phase).toBe('compact');

    state = reduceSearchChrome(state, { type: 'scroll', y: 0 });
    expect(state.phase).toBe('compact');

    const opened = reduceSearchChrome(state, { type: 'open' });
    expect(opened.phase).toBe('expanded');
    const focused = reduceSearchChrome(state, { type: 'focus' });
    expect(focused.phase).toBe('expanded');
  });

  it('opens and closes a compact search session explicitly', () => {
    let state: SearchChromeState = {
      ...initialSearchChromeState(false),
      phase: 'compact',
    };
    state = reduceSearchChrome(state, { type: 'open' });
    expect(state).toMatchObject({ phase: 'expanded', sessionOpen: true });
    expect(reduceSearchChrome(state, { type: 'close' })).toMatchObject({
      phase: 'compact',
      sessionOpen: false,
    });
  });
});

function source(relativePath: string) {
  const url = new URL(relativePath, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

describe('marketplace navigation source contract', () => {
  const navigation = source('../components/marketplace/marketplace-navigation.tsx');

  it('uses one transition context and focuses completed results outside dialogs', () => {
    expect(navigation).toContain('MarketplaceNavigationProvider');
    expect(navigation).toContain('startTransition');
    expect(navigation).toContain('router.push(href)');
    expect(navigation).toContain("[role='dialog']");
    expect(navigation).toContain("getElementById('marketplace-results-heading')");
    expect(navigation).toContain('preventScroll: true');
    expect(navigation).toContain('createContext<');
    expect(navigation).toContain('undefined');
  });

  it('keeps a real Next link and intercepts only unmodified internal primary clicks', () => {
    expect(navigation).toContain('<Link');
    expect(navigation).toContain('event.metaKey');
    expect(navigation).toContain('event.ctrlKey');
    expect(navigation).toContain('event.shiftKey');
    expect(navigation).toContain('event.altKey');
    expect(navigation).toContain('event.button !== 0');
    expect(navigation).toContain("target === '_blank'");
    expect(navigation).toContain('event.preventDefault()');
    expect(navigation).toContain('download');
    expect(navigation).toContain('external');
  });
});

describe('marketplace search source contract', () => {
  const search = source('../components/marketplace/marketplace-search.tsx');

  it('preserves query state and owns deterministic mobile collapse inputs', () => {
    expect(search).toContain('setMarketplaceSearch');
    expect(search).toContain('marketplaceHref');
    expect(search).toContain("{ passive: true }");
    expect(search).toContain('requestAnimationFrame');
    expect(search).toContain("(orientation: landscape) and (max-height: 480px)");
    expect(search).toContain("(prefers-reduced-motion: reduce)");
    expect(search).toContain('onFocusCapture');
    expect(search).toContain('onBlurCapture');
  });

  it('registers a non-locking overlay and supports hash focus and measured sticky height', () => {
    expect(search).toContain('useTelegramBackLayer');
    expect(search).toContain("kind: 'overlay'");
    expect(search).toContain('lockVerticalSwipes: false');
    expect(search).toContain("#marketplace-search");
    expect(search).toContain('ResizeObserver');
    expect(search).toContain('--marketplace-sticky-height');
    expect(search).toContain('Qidiruvni ochish');
    expect(search).toContain('min-h-11 min-w-11');
  });
});

describe('marketplace search integration source contract', () => {
  const layout = source('../app/marketplace/layout.tsx');
  const search = source('../components/marketplace/marketplace-search.tsx');
  const shell = source('../components/marketplace/marketplace-shell.tsx');
  const page = source('../app/marketplace/page.tsx');
  const globals = source('../app/globals.css');

  it('mounts the persistent provider and one lossless shell search', () => {
    expect(layout).toContain('<MarketplaceNavigationProvider>');
    expect(shell.match(/<MarketplaceSearch/g)).toHaveLength(1);
    expect(shell).not.toContain('<form action="/marketplace"');
    expect(shell).toContain('marketplaceQuery?: string');
    expect(shell).toContain('collapsibleSearch?: boolean');
    expect(shell).toContain('data-marketplace-shell');
    expect(page).toContain('marketplaceQuery={rawQuery}');
    expect(page).toContain('collapsibleSearch');
  });

  it('keeps verification outside sticky chrome and defines the two-phase animation', () => {
    expect(shell.indexOf('</header>')).toBeLessThan(shell.indexOf('Akkount tasdiqlanmagan'));
    expect(globals).toContain('.marketplace-search-inner');
    expect(globals).toContain('transform 180ms ease');
    expect(globals).toContain(".marketplace-search[data-phase='collapsing']");
    expect(globals).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('renders short-landscape search compact before paint and synchronizes state in layout', () => {
    expect(search).toContain('React.useLayoutEffect');
    expect(search).toContain('useIsomorphicLayoutEffect(() =>');
    expect(search).toContain('data-short-landscape={state.shortLandscape');
    expect(globals).toContain('@media (orientation: landscape) and (max-height: 480px)');
    expect(globals).toContain(
      ".marketplace-search--collapsible[data-short-landscape='false'][data-session-open='false']",
    );
  });
});

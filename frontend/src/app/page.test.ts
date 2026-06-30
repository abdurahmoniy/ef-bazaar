import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import HomePage from './page';

function renderLanding() {
  return renderToStaticMarkup(HomePage());
}

describe('HomePage redesign contract', () => {
  it('renders the marketplace-first hero and primary routes', () => {
    const markup = renderLanding();

    expect(markup).toContain('Quiet account market');
    expect(markup).toContain('Minimal Soft UI marketplace');
    expect(markup).toContain('Browse with signal, not noise');
    expect(markup).toContain('href="/marketplace"');
    expect(markup).toContain('href="/marketplace/new"');
    expect(markup).not.toContain('Glass trade desk');
    expect(markup).not.toContain('Live market cockpit');
  });

  it('keeps the landing page grounded in implemented trust signals', () => {
    const markup = renderLanding().toLowerCase();

    expect(markup).toContain('telegram');
    expect(markup).toContain('google');
    expect(markup).toContain('24 soat');
    expect(markup).not.toContain('escrow');
    expect(markup).not.toContain('ai pricing');
    expect(markup).not.toContain('konami');
  });
});

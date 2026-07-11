import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import HomePage from './page';

function renderLanding() {
  return renderToStaticMarkup(HomePage());
}

describe('HomePage redesign contract', () => {
  it('renders the marketplace-first hero in Uzbek with primary routes', () => {
    const markup = renderLanding();

    expect(markup).toContain('eFBazaar');
    expect(markup).toContain('Diviziyon, kuch, tanga');
    expect(markup).toContain('href="/marketplace"');
    expect(markup).toContain('href="/marketplace/new"');
    expect(markup).not.toContain('Browse with signal');
    expect(markup).not.toContain('Buyer flow');
    expect(markup).not.toContain('Seller flow');
    expect(markup).not.toContain('Selected account');
  });

  it('keeps the landing page grounded in implemented trust signals, not overclaiming', () => {
    const markup = renderLanding().toLowerCase();

    expect(markup).toContain('telegram');
    expect(markup).toContain('google');
    expect(markup).toContain('24 soat');
    expect(markup).not.toContain('escrow');
    expect(markup).not.toContain('ai pricing');
    expect(markup).not.toContain('konami');
  });
});

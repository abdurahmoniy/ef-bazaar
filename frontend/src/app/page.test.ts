// @vitest-environment jsdom

import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/growth/referral-welcome', () => ({
  ReferralWelcome: () => createElement('aside', { 'data-testid': 'referral-welcome' }, 'Taklif orqali xush kelibsiz'),
}));

import HomePage, { metadata } from './page';
import { siteConfig } from '@/lib/site';

function renderLanding() {
  return renderToStaticMarkup(HomePage());
}

describe('published landing homepage', () => {
  it('renders the approved v2 hero and its existing marketplace routes at the root', () => {
    const markup = renderLanding();
    document.body.innerHTML = markup;

    expect(markup).toContain('eFBazaar');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe('Akkount emas — yulduz qidiring.');
    expect(markup).toContain('href="/marketplace"');
    expect(markup).toContain('href="/marketplace/new"');
    expect(document.querySelector('header button[aria-label="Qorong‘i rejim"]')).not.toBeNull();
    expect(document.querySelector('main [data-testid="referral-welcome"]')).not.toBeNull();
    expect(document.querySelector('a[href*="valuable_players_name=Ruud"]')).not.toBeNull();
  });

  it('keeps implemented trading scope and avoids unsupported promises', () => {
    const markup = renderLanding().toLowerCase();

    expect(markup).toContain('telegram');
    expect(markup).toContain('mobile uchun smart admin bilan garov bitimi');
    expect(markup).toContain('komissiya');
    expect(markup).toContain('steam va playstation uchun admin yordami');
    expect(markup).not.toContain('24 soat');
    expect(markup).not.toContain("to'lovni o'z ichiga olmaydi");
    expect(markup).not.toContain('login-parol platformada saqlanmaydi');
    expect(markup).not.toContain('ai pricing');
    expect(markup).not.toContain('konami');
  });

  it('publishes the homepage for indexing with the root canonical and brand title', () => {
    expect(metadata.alternates?.canonical).toBe('/');
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.title).toEqual({ absolute: siteConfig.title });
  });

  it('retains truthful organization and website search metadata without absent FAQs', () => {
    document.body.innerHTML = renderLanding();
    const schema = JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(schema['@graph'].map((item: { '@type': string }) => item['@type'])).toEqual(['Organization', 'WebSite', 'WebApplication']);
    const website = schema['@graph'].find((item: { '@type': string }) => item['@type'] === 'WebSite');
    expect(website.url).toBe(siteConfig.url);
    expect(website.potentialAction.target.urlTemplate).toBe(`${siteConfig.url}/marketplace?q={search_term_string}`);
  });
});

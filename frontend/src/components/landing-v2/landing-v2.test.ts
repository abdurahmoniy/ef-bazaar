// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { parseListingSearchParams } from '@/lib/marketplace-format';
import { siteConfig } from '@/lib/site';
import { E_MARK } from '@/components/brand/e-mark';
import { LandingV2 } from './landing-v2';

beforeEach(() => {
  document.body.innerHTML = renderToStaticMarkup(createElement(LandingV2));
});

describe('Landing v2', () => {
  it('offers an accessible light/dark control in the header', () => {
    expect(document.querySelector('header button[aria-label="Qorong‘i rejim"]')).not.toBeNull();
  });

  it('uses the marketplace primary session action with its user icon', () => {
    const login = document.querySelector('header a[href="/auth/login"]');
    expect(login?.classList.contains('bg-primary')).toBe(true);
    expect(login?.classList.contains('text-primary-foreground')).toBe(true);
    expect(login?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('uses the official linked brand mark in the header and footer', () => {
    for (const selector of ['header', 'footer']) {
      const logo = document.querySelector(`${selector} a[aria-label="eFBazaar bosh sahifa"]`);
      expect(logo?.getAttribute('href')).toBe('/');
      expect(logo?.textContent).toBe('eFBazaar');
      expect(logo?.querySelector('svg mask')).not.toBeNull();
      expect(logo?.querySelector('svg > path')?.getAttribute('d')).toBe(E_MARK.barPath);
    }
  });

  it('introduces the marketplace with one main heading and a usable primary action', () => {
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe('Akkount emas — yulduz qidiring.');
    const hero = document.querySelector('section[aria-labelledby="landing-v2-title"]');
    expect(hero?.querySelector('a[href="/marketplace"]')?.textContent).toContain('Bozorni ko‘rish');
    expect(document.querySelector('header a[href="/auth/login"]')?.textContent).toBe('Kirish');
  });

  it('opens working marketplace filters for every featured player', () => {
    const players = document.querySelectorAll('nav[aria-label="Yulduz kartalar"] a');
    expect(players).toHaveLength(5);
    const expected = [
      ['Gullit', 'Ruud Gullit'],
      ['Ronaldo', 'Cristiano Ronaldo'],
      ['Messi', 'Lionel Messi'],
      ['Rummenigge', 'Karl-Heinz Rummenigge'],
      ['Vieira', 'Patrick Vieira'],
    ];
    players.forEach((link, index) => {
      expect(link.textContent).toContain(expected[index][0]);
      const url = new URL(link.getAttribute('href')!, 'https://efbazaar.uz');
      expect(url.pathname).toBe('/marketplace');
      const filters = parseListingSearchParams(Object.fromEntries(url.searchParams));
      expect(filters.attributes?.valuable_players_name).toBe(expected[index][1]);
    });
  });

  it('keeps navigation, selling and configured social links usable', () => {
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a')];
    for (const link of anchors.filter((anchor) => anchor.hash && anchor.getAttribute('href')?.startsWith('#'))) {
      expect(document.getElementById(link.hash.slice(1))).not.toBeNull();
    }
    for (const href of ['/marketplace/new', '/help', '/invite', '/partnership', siteConfig.links.telegramBot, siteConfig.links.telegramChannel, siteConfig.links.instagram]) {
      expect(anchors.some((anchor) => anchor.getAttribute('href') === href)).toBe(true);
    }
    expect(decodeURIComponent(document.querySelector('img')?.getAttribute('src') ?? '')).toContain('/landing-v2/legends');
    expect(document.querySelector('a[href="#landing-v2-main"]')).not.toBeNull();
  });

  it('explains escrow without extending Mobile automation to other platforms', () => {
    const escrow = document.getElementById('garov');
    expect(escrow?.textContent).toContain('Mobile');
    expect(escrow?.textContent).toContain('Steam va PlayStation savdolarida admin yordam beradi.');
    expect(escrow?.textContent).toContain('komissiya');
    expect(document.getElementById('qanday-ishlaydi')?.querySelectorAll('li')).toHaveLength(3);
  });
});

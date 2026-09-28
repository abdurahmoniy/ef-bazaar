import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GiveReceiveBlock, ReceivedLine, SwapPair } from './swap-accounts-summary';
import type { SwapSide } from '@/lib/swap-accounts';

const listing: SwapSide = { title: 'E’lon akk', coverUrl: '/photo/m-1', teamStrength: 3100, external: false };
const given: SwapSide = { title: 'Asosiy akk', coverUrl: null, teamStrength: 3250, external: false };
const external: SwapSide = { title: 'Platformadan tashqari akkount', coverUrl: null, teamStrength: null, external: true };

describe('swap accounts summary', () => {
  it('shows both accounts side by side', () => {
    const html = renderToStaticMarkup(createElement(SwapPair, { left: listing, right: given }));
    expect(html).toContain('E’lon akk');
    expect(html).toContain('Asosiy akk');
    expect(html).toContain('⇄');
    expect(html).toContain('TS 3250');
  });

  it('says the buyer will choose while a seller swap is pending', () => {
    const html = renderToStaticMarkup(createElement(SwapPair, { left: listing, right: null, rightPending: true }));
    expect(html).toContain('Xaridor tanlaydi');
  });

  it('marks an off-platform account', () => {
    expect(renderToStaticMarkup(createElement(SwapPair, { left: listing, right: external })))
      .toContain('Platformadan tashqari akkount');
  });

  it('tells the viewer what they receive in one line', () => {
    const html = renderToStaticMarkup(createElement(ReceivedLine, { side: given }));
    expect(html).toContain('Siz olasiz');
    expect(html).toContain('Asosiy akk');
  });

  it('lists give and receive in the drawer', () => {
    const html = renderToStaticMarkup(createElement(GiveReceiveBlock, { give: listing, receive: given }));
    expect(html).toMatch(/Siz berasiz[\s\S]*E’lon akk[\s\S]*Siz olasiz[\s\S]*Asosiy akk/);
  });
});

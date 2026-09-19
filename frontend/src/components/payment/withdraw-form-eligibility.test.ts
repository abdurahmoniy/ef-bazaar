import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WithdrawForm } from './withdraw-form';
import { MIN_WITHDRAWAL_TIYIN } from '@/lib/withdrawal';
describe('withdrawal eligibility', () => {
  it.each([0, MIN_WITHDRAWAL_TIYIN - 1])('explains insufficient balance before asking for card details (%i)', (availableTiyin) => {
    const html = renderToStaticMarkup(createElement(WithdrawForm, { availableTiyin, defaultOpen: true, onCreated: () => {} }));
    expect(html).toContain('Eng kam yechish');
    expect(html).not.toContain('id="wd-pan"');
  });
  it('allows the form when available balance reaches the minimum', () => {
    const html = renderToStaticMarkup(createElement(WithdrawForm, { availableTiyin: MIN_WITHDRAWAL_TIYIN, defaultOpen: true, onCreated: () => {} }));
    expect(html).toContain('id="wd-pan"');
  });
});

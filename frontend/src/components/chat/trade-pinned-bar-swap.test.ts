import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { TradeResponse } from '@/lib/trade-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('./trade-context', () => ({ useTradeContext: vi.fn() }));
import { useTradeContext } from './trade-context';
import { TradePinnedBar } from './trade-pinned-bar';

const trade = {
  id: 't-1', state: 'WAITING_EMAIL_CHANGE', sellerId: 'seller', buyerId: 'buyer', priceUzs: 0, kind: 'SWAP',
  mode: 'SMART', sides: [], createdAt: '2026-09-28T10:00:00Z', expiresAt: null, stateDeadline: null, role: null,
  passwordMessageId: null, emailChangeVerificationCode: null, mailboxId: null, mailboxEmail: null, chatId: 'chat',
  giveAccount: { id: 'acc-1', title: 'Asosiy akk', coverMessageId: 'm-1', summary: 'Kuchli', teamStrength: 3250 },
} as unknown as TradeResponse;

function renderFor(viewerId: string, overrides: Partial<TradeResponse> = {}) {
  const t = { ...trade, ...overrides };
  vi.mocked(useTradeContext).mockReturnValue({
    viewerId, activeTrade: t, trades: [t], proposal: null, lastFinished: null, startingNew: false,
    setStartingNew: vi.fn(), accountRequest: null, isDrawerOpen: false, setShowPicker: vi.fn(),
    isSeller: viewerId === 'seller', setShowAcceptModal: vi.fn(), setShowProposeModal: vi.fn(), setIsDrawerOpen: vi.fn(),
    requiresAdminHandoff: false,
    listing: { id: 'listing', description: 'E’lon akk TS3100\nbatafsil', mediaMessageIds: ['m-9'], attributes: {} },
  } as unknown as ReturnType<typeof useTradeContext>);
  return renderToStaticMarkup(createElement(TradePinnedBar));
}

beforeEach(() => vi.clearAllMocks());

it('the seller sees the buyer account they receive', () => {
  const html = renderFor('seller');
  expect(html).toContain('Siz olasiz');
  expect(html).toContain('Asosiy akk');
});

it('the buyer sees the listing account they receive', () => {
  const html = renderFor('buyer');
  expect(html).toContain('Siz olasiz');
  expect(html).toContain('E’lon akk TS3100');
  expect(html).not.toContain('Asosiy akk');
});

it('the seller of an Other swap is told it is off-platform', () => {
  expect(renderFor('seller', { giveAccount: null })).toContain('Platformadan tashqari akkount');
});

it('a sale shows no receive line', () => {
  expect(renderFor('seller', { kind: 'SALE', priceUzs: 50000 })).not.toContain('Siz olasiz');
});

import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getMe: vi.fn(), getTrade: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }) }));
vi.mock('@/lib/auth', () => ({ getMe: mocks.getMe }));
vi.mock('@/lib/trade-server', () => ({ getTradeById: mocks.getTrade }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/marketplace/marketplace-shell', () => ({ MarketplaceShell: () => null }));
import WalletTradePage from './page';
import WalletLoading from '../../loading';
const id = '22222222-2222-4222-8222-222222222222';
const chatId = '33333333-3333-4333-8333-333333333333';
const open = () => WalletTradePage({ params: Promise.resolve({ id }) });
beforeEach(() => { vi.clearAllMocks(); mocks.getMe.mockResolvedValue({ id: 'viewer' }); });
it('sends signed-out visitors to login before fetching trade data', async () => {
  mocks.getMe.mockResolvedValue(null);
  await expect(open()).rejects.toThrow('redirect:/auth/login');
  expect(mocks.getTrade).not.toHaveBeenCalled();
});
it('opens the associated chat only for a participant', async () => {
  mocks.getTrade.mockResolvedValue({ id, buyerId: 'viewer', sellerId: 'seller', chatId });
  await expect(open()).rejects.toThrow(`redirect:/chats/${chatId}`);
});
it('does not expose a chat route to a nonparticipant', async () => {
  mocks.getTrade.mockResolvedValue({ id, buyerId: 'other', sellerId: 'seller', chatId });
  await open();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it('keeps unavailable or chatless trades recoverable', async () => {
  for (const trade of [null, { id, buyerId: 'viewer', sellerId: 'seller', chatId: null }]) {
    mocks.getTrade.mockResolvedValue(trade);
    const page = await open();
    expect(page.props.activeTab).toBe('profile');
    expect(mocks.redirect).not.toHaveBeenCalled();
  }
});

it('keeps Profile selected while the wallet session loads', () => {
  const page = WalletLoading();
  expect(page.props.activeTab).toBe('profile');
  expect(page.props.sessionPending).toBe(true);
});

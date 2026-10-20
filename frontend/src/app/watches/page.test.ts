import { expect, it, vi, afterEach } from 'vitest';
const mocks=vi.hoisted(()=>({getMe:vi.fn(),apiFetch:vi.fn(),redirect:vi.fn((href:string)=>{throw new Error(`redirect:${href}`);})}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth',()=>({getMe:mocks.getMe}));
vi.mock('@/lib/api',()=>({apiFetch:mocks.apiFetch}));
vi.mock('next/navigation',()=>({redirect:mocks.redirect}));
vi.mock('@/components/marketplace/marketplace-shell',()=>({MarketplaceShell:()=>null}));
vi.mock('@/components/watch/watches-view',()=>({WatchesView:()=>null}));
import WatchesPage from './page';
afterEach(()=>vi.resetAllMocks());
it('awaits the canonical payment plans/me request for a fresh authenticated Free user before rendering watches',async()=>{
  mocks.getMe.mockResolvedValue({id:'fresh-free'});
  let finish!:(value:unknown)=>void;
  mocks.apiFetch.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  let rendered=false;
  const result=WatchesPage({}).then(element=>{rendered=true;return element;});
  await Promise.resolve();await Promise.resolve();
  expect(mocks.apiFetch).toHaveBeenCalledWith('/payment/v1/payments/plans/me');
  expect(rendered).toBe(false);
  finish({code:'STANDARD',expiresAt:null,entitlements:{}});
  const element=await result;
  expect(element).toBeTruthy();
  expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
});
it('retains the watch page when payment bootstrap is unavailable and invents no local Free grant',async()=>{
  mocks.getMe.mockResolvedValue({id:'fresh-free'});mocks.apiFetch.mockRejectedValue(new Error('payment unavailable'));
  const element=await WatchesPage({});
  expect(mocks.apiFetch).toHaveBeenCalledWith('/payment/v1/payments/plans/me');
  expect(element).toBeTruthy();
  expect(element.props.children.props).toEqual({initialQuery:''});
});
it('does not initialize a plan for a signed-out visitor',async()=>{
  mocks.getMe.mockResolvedValue(null);mocks.redirect.mockImplementation(href=>{throw new Error(`redirect:${href}`);});
  await expect(WatchesPage({})).rejects.toThrow('redirect:/auth/login');
  expect(mocks.apiFetch).not.toHaveBeenCalled();
});

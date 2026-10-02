// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/popups/client', () => ({ listPopupCampaigns: vi.fn(), createPopupCampaign: vi.fn(), setPopupCampaignStatus: vi.fn() }));
import { listPopupCampaigns, createPopupCampaign, setPopupCampaignStatus } from '@/lib/popups/client';
import { AdminPopups } from './admin-popups';
const draft={ id:'one', title:'Xush kelibsiz', message:'Do‘stingizni taklif qiling.', tone:'INFO' as const, audience:'ALL' as const, recipientIds:[], trigger:'BROWSE' as const, startsAt:'2026-10-03T00:00:00Z', endsAt:'2026-10-04T00:00:00Z', priority:0, status:'DRAFT' as const, createdAt:'2026-10-02T00:00:00Z', createdBy:'admin', shownCount:0, clickedCount:0, dismissedCount:0 };
let root: Root; let container: HTMLDivElement;
beforeEach(() => { vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-10-02T00:00:00Z')); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.mocked(listPopupCampaigns).mockResolvedValue([draft]); vi.mocked(createPopupCampaign).mockResolvedValue(draft); container=document.createElement('div'); document.body.append(container); root=createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function render() { await act(async () => root.render(createElement(AdminPopups))); }
async function fill(name: string, value: string) {
 const el=container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
 const prototype=el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
 await act(async () => { Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(el,value); el.dispatchEvent(new Event('input',{bubbles:true})); });
}
const click = async (selector: string) => act(async () => (container.querySelector(selector) as HTMLButtonElement).click());
it('previews without saving or sending and closes accessibly', async () => {
 await render(); await fill('title','Yangi e’lonlar'); await fill('message','Bozorni ko‘rib chiqing.'); await click('[data-preview]');
 expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Yangi e’lonlar'); expect(createPopupCampaign).not.toHaveBeenCalled(); expect(setPopupCampaignStatus).not.toHaveBeenCalled();
 await act(async () => (document.querySelector('[data-popup-dismiss]') as HTMLButtonElement).click()); expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('saves a draft and requires a separate explicit publish action', async () => {
 await render(); await fill('title','Yangi e’lonlar'); await fill('message','Bozorni ko‘rib chiqing.'); await click('[data-save-draft]');
 expect(createPopupCampaign).toHaveBeenCalledWith(expect.objectContaining({title:'Yangi e’lonlar',message:'Bozorni ko‘rib chiqing.',audience:'ALL'})); expect(setPopupCampaignStatus).not.toHaveBeenCalled();
 vi.mocked(setPopupCampaignStatus).mockResolvedValue({...draft,status:'ACTIVE'});
 await click('[data-publish="one"]'); expect(setPopupCampaignStatus).toHaveBeenCalledWith('one','ACTIVE'); expect(container.textContent).toContain('Rejalashtirilgan');
});
it('preserves the draft and reports a server failure', async () => {
 await render(); await fill('title','Saqlangan matn'); await fill('message','Xabar matni'); vi.mocked(createPopupCampaign).mockRejectedValue(new Error('Aloqa yo‘q')); await click('[data-save-draft]');
 expect(container.querySelector('[role="alert"]')?.textContent).toContain('Aloqa yo‘q'); expect(container.querySelector<HTMLInputElement>('[name="title"]')?.value).toBe('Saqlangan matn');
});
it('keeps a newly saved draft when an older list request finishes afterward', async () => {
 let finish!: (items: typeof draft[]) => void;
 vi.mocked(listPopupCampaigns).mockImplementation(() => new Promise(resolve => {finish=resolve;}));
 await render(); await fill('title','Yangi e’lonlar'); await fill('message','Bozorni ko‘rib chiqing.'); await click('[data-save-draft]');
 await act(async () => finish([]));
 expect(container.querySelector('[data-publish="one"]')).not.toBeNull();
});

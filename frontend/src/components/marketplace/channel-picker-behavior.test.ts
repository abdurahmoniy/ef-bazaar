// @vitest-environment jsdom
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelCard } from '@/lib/partner-channels';
const { searchChannels } = vi.hoisted(() => ({ searchChannels: vi.fn() }));
vi.mock('@/lib/partner-channels', async (original) => ({ ...await original<object>(), searchChannels }));
vi.mock('next/link', () => ({ default: 'a' }));
import { ChannelPicker } from './channel-picker';
const a: ChannelCard = { channelId:'a', title:'Birinchi kanal', priceSom:5000, subscriberCount:12000, username:'first_channel', photoFileId:null };
const b: ChannelCard = { ...a, channelId:'b', title:'Ikkinchi kanal', priceSom:7000 };
let host:HTMLDivElement; let root:Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?:boolean }).IS_REACT_ACT_ENVIRONMENT=true;
  vi.useFakeTimers(); vi.clearAllMocks(); searchChannels.mockResolvedValue([a,b]);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();});
function Picker({ disabled=false }:{disabled?:boolean}) { const [selected,setSelected]=React.useState<ChannelCard[]>([]); return React.createElement(ChannelPicker,{selected,onChange:setSelected,disabled}); }
const mount=async(disabled=false)=>{await act(async()=>root.render(React.createElement(Picker,{disabled})));await act(async()=>vi.advanceTimersByTime(300));};
const pick=(title:string)=>Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')).find(button=>button.textContent?.includes(title))!;
async function query(value:string) { await act(async()=>{const input=host.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}); await act(async()=>vi.advanceTimersByTime(300)); }
describe('channel selection for mobile advertising',()=>{
  it('keeps selected names and the full total when search results change',async()=>{
    await mount();await act(async()=>pick(a.title).click());
    searchChannels.mockResolvedValue([b]);await query('Ikkinchi');
    await act(async()=>pick(b.title).click());
    expect(host.querySelector('[aria-label="Tanlangan kanallar"]')?.textContent).toContain(a.title);
    expect(host.querySelector('[aria-label="Reklama jami"]')?.textContent).toContain('12 000');
    const remove=host.querySelector<HTMLButtonElement>('button[aria-label="Birinchi kanal tanlovdan olib tashlash"]')!;
    await act(async()=>remove.click());
    expect(host.querySelector('[aria-label="Reklama jami"]')?.textContent).toContain('7 000');
  });
  it('distinguishes a failed load from an empty catalogue and offers retry',async()=>{
    searchChannels.mockRejectedValueOnce(new Error('offline'));await mount();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Hozircha hamkor kanallari yo‘q');
    const retry=Array.from(host.querySelectorAll('button')).find(button=>button.textContent?.includes('Qayta urinish'))!;
    await act(async()=>retry.click());await act(async()=>vi.advanceTimersByTime(300));expect(pick(a.title)).toBeDefined();
  });
  it('shows free pricing explicitly and disables selections during an order',async()=>{
    searchChannels.mockResolvedValue([{...a,priceSom:0}]);await mount(true);
    expect(pick(a.title).textContent).toContain('Bepul');expect(pick(a.title).disabled).toBe(true);
    expect(host.querySelector('input')?.disabled).toBe(true);
  });
  it('does not replace current results with a slow older search response',async()=>{
    let resolveOld!:(value:ChannelCard[])=>void;
    searchChannels.mockReturnValueOnce(new Promise<ChannelCard[]>(resolve=>{resolveOld=resolve;}));
    await mount();searchChannels.mockResolvedValue([b]);await query('Ikkinchi');
    await act(async()=>resolveOld([a]));
    expect(pick(b.title)).toBeDefined();expect(pick(a.title)).toBeUndefined();
  });
});

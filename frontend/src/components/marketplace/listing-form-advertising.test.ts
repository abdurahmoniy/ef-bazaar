// @vitest-environment jsdom
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListingResponse } from '@/lib/marketplace-types';
const { push, refresh, nativeButton } = vi.hoisted(()=>({push:vi.fn(),refresh:vi.fn(),nativeButton:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push,refresh})}));
vi.mock('@/hooks/use-telegram-main-button',()=>({useTelegramMainButton:nativeButton}));
vi.mock('@/components/marketplace/card-picker',()=>({CardPicker:()=>null}));
vi.mock('@/lib/payment-client',()=>({getPublicTradeCommissionConfig:()=>Promise.resolve(null)}));
vi.mock('@/components/marketplace/channel-picker',()=>({ChannelPicker:({onChange}:{onChange:(channels:unknown[])=>void})=>React.createElement('button',{type:'button',onClick:()=>onChange([{channelId:'chan-a',title:'Test kanal',priceSom:5000,subscriberCount:1000,username:null,photoFileId:null}])},'Sinov kanalini tanlash')}));
import { ListingForm } from './listing-form';
let host:HTMLDivElement; let root:Root;let fetchMock:ReturnType<typeof vi.fn>;
const listing={id:'own-1',sellerId:'user',description:'Test uchun yetarli tavsif',price:50000,priceNegotiable:false,attributes:{},mediaMessageIds:['photo'],status:'ACTIVE',likeCount:0} as ListingResponse;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();localStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.spyOn(window,'scrollTo').mockImplementation(()=>{});URL.createObjectURL=vi.fn(()=> 'blob:test');URL.revokeObjectURL=vi.fn();fetchMock=vi.fn().mockResolvedValue({ok:true,text:async()=>JSON.stringify({id:'saved-1'})});vi.stubGlobal('fetch',fetchMock);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const button=(text:string)=>Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()===text)!;
const click=async(text:string)=>{await act(async()=>button(text).click());};
async function fill(selector:string,value:string) {await act(async()=>{const input=host.querySelector<HTMLInputElement|HTMLTextAreaElement>(selector)!;Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function pricing(edit=false) {
 await act(async()=>root.render(React.createElement(ListingForm,{attributeDefinitions:[],...(edit?{initialListing:listing}:{})})));
 if(!edit)await act(async()=>{const input=host.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(input,'files',{configurable:true,value:[new File(['test'],'test.png',{type:'image/png'})]});input.dispatchEvent(new Event('change',{bubbles:true}));});
 await click('Davom etish');if(!edit)await fill('#description','Test uchun yetarli tavsif');await click('Davom etish');await click('Davom etish');if(!edit)await fill('#price','50000');
}
async function requestBody() {const data=fetchMock.mock.calls[0][1].body.get('data') as Blob;return JSON.parse(await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(data);}));}
describe('save listing before advertising purchase',()=>{
 it('creates without charging channels, then carries selected IDs into review',async()=>{
  await pricing();await click('Kanallarni tanlash');await click('Sinov kanalini tanlash');await click('Davom etish');
  expect(host.textContent).toContain('5 000');expect(nativeButton.mock.calls.at(-1)?.[0].text).toBe('Yaratish va reklama');
  await click('Yaratish va reklama');expect(fetchMock).toHaveBeenCalledOnce();expect(fetchMock.mock.calls[0][1].method).toBe('POST');expect(await requestBody()).not.toHaveProperty('channelIds');expect(push).toHaveBeenCalledWith('/marketplace/saved-1/advertise?channel=chan-a');
 });
 it('saves edits before opening advertising and never submits an ad order',async()=>{
  await pricing(true);await click('Kanallarni tanlash');await click('Sinov kanalini tanlash');await click('Davom etish');await click('Saqlash va reklama');
  expect(fetchMock).toHaveBeenCalledOnce();expect(fetchMock.mock.calls[0][1].method).toBe('PUT');expect(await requestBody()).not.toHaveProperty('channelIds');expect(push).toHaveBeenCalledWith('/marketplace/saved-1/advertise?channel=chan-a');
 });
 it('keeps advertising optional and sends an ordinary listing to its detail',async()=>{
  await pricing();await click('Davom etish');await click("E'lon yaratish");expect(await requestBody()).not.toHaveProperty('channelIds');expect(push).toHaveBeenCalledWith('/marketplace/saved-1');
 });
 it('does not open advertising when listing save fails',async()=>{
  fetchMock.mockResolvedValue({ok:false,status:503,text:async()=>JSON.stringify({message:'Saqlash vaqtincha ishlamayapti'})});await pricing(true);await click('Kanallarni tanlash');await click('Davom etish');await click('Saqlash va reklama');expect(push).not.toHaveBeenCalled();expect(fetchMock).toHaveBeenCalledOnce();
 });
});

// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompletionNotice } from '@/components/marketplace/completion-notice';
import { PopupTriggerSignal, TradeCompletedPopupTrigger } from './popup-trigger';
import { clearPopupTrigger, pendingPopupTrigger, queuePopupTrigger } from '@/lib/popups/triggers';
let root:Root;let div:HTMLDivElement;
beforeEach(()=>{window.history.replaceState(null,'','/');vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);clearPopupTrigger();div=document.createElement('div');document.body.append(div);root=createRoot(div);});
afterEach(async()=>{await act(async()=>root.unmount());div.remove();vi.useRealTimers();vi.unstubAllGlobals();});
it('queues only a newly completed trade, not success in existing history',async()=>{
 await act(async()=>root.render(createElement(TradeCompletedPopupTrigger,{userId:'user',trades:[{id:'old',state:'SUCCESS'}]})));
 expect(pendingPopupTrigger('user','/marketplace')).toBe('BROWSE');
 await act(async()=>root.render(createElement(TradeCompletedPopupTrigger,{userId:'user',trades:[{id:'old',state:'SUCCESS'},{id:'new',state:'IN_PROGRESS'}]})));
 await act(async()=>root.render(createElement(TradeCompletedPopupTrigger,{userId:'user',trades:[{id:'old',state:'SUCCESS'},{id:'new',state:'SUCCESS'}]})));
 expect(pendingPopupTrigger('user','/marketplace')).toBe('TRADE_COMPLETED');
});
it('expires contextual triggers and scopes them to the account and relevant page',()=>{
 vi.useFakeTimers();queuePopupTrigger('EMPTY_SEARCH','a','search1','/marketplace');expect(pendingPopupTrigger('a','/profile')).toBe('BROWSE');
 queuePopupTrigger('LISTING_PUBLISHED','a','listing1');expect(pendingPopupTrigger('b','/marketplace')).toBe('BROWSE');
 queuePopupTrigger('TRADE_COMPLETED','a','trade1');vi.advanceTimersByTime(300_001);expect(pendingPopupTrigger('a','/marketplace')).toBe('BROWSE');
});

it('withdraws an empty search signal when results replace the empty state',async()=>{
 await act(async()=>root.render(createElement(PopupTriggerSignal,{trigger:'EMPTY_SEARCH',userId:'user',eventKey:'no-results'})));
 expect(pendingPopupTrigger('user','/')).toBe('EMPTY_SEARCH');
 await act(async()=>root.render(null));
 expect(pendingPopupTrigger('user','/')).toBe('BROWSE');
});

it('preserves listing publication after the real completion notice consumes its result parameter',async()=>{
 const path='/marketplace/123e4567-e89b-12d3-a456-426614174000';
 window.history.replaceState(null,'',path+'?result=published');
 await act(async()=>root.render(createElement('div',null,
  createElement(PopupTriggerSignal,{trigger:'LISTING_PUBLISHED',userId:'user',eventKey:'listing-published'}),
  createElement(CompletionNotice,{title:'Joylandi',description:'E’lon tayyor'}))));
 expect(window.location.search).toBe('');
 expect(pendingPopupTrigger('user',path)).toBe('LISTING_PUBLISHED');
});
it('refreshes an empty-results signal when filters change but the generic copy stays the same',async()=>{
 vi.useFakeTimers();window.history.replaceState(null,'','/marketplace?minPrice=100');
 await act(async()=>root.render(createElement(PopupTriggerSignal,{trigger:'EMPTY_SEARCH',userId:'user',eventKey:'generic-empty'})));
 window.history.replaceState(null,'','/marketplace?minPrice=200');
 await act(async()=>vi.advanceTimersByTimeAsync(1000));
 expect(pendingPopupTrigger('user','/marketplace?minPrice=200')).toBe('EMPTY_SEARCH');
});

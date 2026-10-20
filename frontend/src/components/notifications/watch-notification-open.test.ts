// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WatchNotification } from './watch-notification';
it('lets the notification center acknowledge opening an individual digest item', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onOpen=vi.fn();
  try {
    await act(async()=>root.render(createElement(WatchNotification,{payload:{items:[{listingId:'l1',reasons:['Messi']}],totalCount:1,remainingCount:0},onOpen})));
    const link=host.querySelector('a')!;
    link.addEventListener('click',event=>event.preventDefault());
    await act(async()=>link.click());expect(onOpen).toHaveBeenCalledTimes(1);
  } finally {await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

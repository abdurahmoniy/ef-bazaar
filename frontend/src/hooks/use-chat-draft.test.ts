// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useChatDraft } from './use-chat-draft';
let root: Root;
let container: HTMLDivElement;
let draft: ReturnType<typeof useChatDraft>;
function Probe({ viewerId, chatId }: { viewerId: string; chatId: string }) { draft = useChatDraft(viewerId, chatId); return null; }
async function render(viewerId = 'buyer', chatId = 'chat') {
  await act(async () => root.render(createElement(Probe, { viewerId, chatId })));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); sessionStorage.clear();
  container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); });
it('restores unsent text on remount and isolates conversations and accounts', async () => {
  await render(); await act(async () => draft[1]('Unsent message'));
  await act(async () => root.render(null)); await render(); expect(draft[0]).toBe('Unsent message');
  await render('buyer', 'second'); expect(draft[0]).toBe('');
  await act(async () => draft[1]('Second chat'));
  await render('seller', 'chat'); expect(draft[0]).toBe('');
  await render(); expect(draft[0]).toBe('Unsent message');
});
it('removes a cleared draft so a sent message does not return', async () => {
  await render(); await act(async () => draft[1]('Sent message')); await act(async () => draft[1](''));
  await act(async () => root.render(null)); await render(); expect(draft[0]).toBe('');
});
it('keeps typing usable when browser storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  await render(); await act(async () => draft[1]('Still typing')); expect(draft[0]).toBe('Still typing');
});

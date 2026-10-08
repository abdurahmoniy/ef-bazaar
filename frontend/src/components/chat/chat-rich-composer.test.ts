// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatRichComposer, type ChatRichComposerHandle } from './chat-rich-composer';
import type { EmojiItem } from '@/lib/emoji-packs';

const emoji: EmojiItem = { customEmojiId: '123', emoji: '😊', format: 'static', thumbnailUrl: '/thumb', fileUrl: '/emoji' };
const packs = [{ id: 'pack', title: 'Football', setName: 'Football', items: [emoji] }];
let container: HTMLDivElement;
let root: Root;
const handle = createRef<ChatRichComposerHandle>();
const onChange = vi.fn();
const onSend = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container); onChange.mockClear(); onSend.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
async function render(value = '', readOnly = false, pickerOpen = true, catalog = packs) {
  await act(async () => root.render(createElement(ChatRichComposer, {
    ref: handle, value, packs: catalog, readOnly, pickerOpen, onChange, onSend,
    onBlur: vi.fn(), onFocus: vi.fn(), onPaste: vi.fn(), placeholder: 'Xabar yozing…',
  })));
  return container.querySelector<HTMLElement>('[role="textbox"]')!;
}
async function select(editor: HTMLElement, node: Node, start: number, end = start) {
  await act(async () => {
    editor.focus();
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, end);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    editor.blur();
  });
}

it('keeps the cursor and inserts repeated custom emoji without reopening the keyboard', async () => {
  const editor = await render('Hello world');
  await select(editor, editor.firstChild!, 6);
  await act(async () => { handle.current!.insertEmoji(emoji); handle.current!.insertEmoji(emoji); });
  expect(editor.textContent).toBe('Hello world');
  expect(onChange).toHaveBeenLastCalledWith('Hello <tg-emoji emoji-id="123">😊</tg-emoji><tg-emoji emoji-id="123">😊</tg-emoji>world');
  expect(document.activeElement).not.toBe(editor);
  await act(async () => handle.current!.focus());
  expect(document.activeElement).toBe(editor);
  expect(window.getSelection()!.anchorOffset).toBe(3);
});

it.each(['👨‍👩‍👧‍👦', '👍🏽', '🇺🇿', 'e\u0301'])('backspace deletes the whole %s grapheme at the saved cursor', async grapheme => {
  const editor = await render(`Hi ${grapheme} there`);
  await select(editor, editor.firstChild!, 3 + grapheme.length);
  await act(async () => handle.current!.deleteBackward());
  expect(onChange).toHaveBeenLastCalledWith('Hi  there');
  expect(document.activeElement).not.toBe(editor);
});

it('backspace removes a selected range, then a custom emoji as one unit', async () => {
  const editor = await render('Hi <tg-emoji emoji-id="123">😊</tg-emoji> there');
  await select(editor, editor.lastChild!, 0, 6);
  await act(async () => handle.current!.deleteBackward());
  expect(onChange).toHaveBeenLastCalledWith('Hi <tg-emoji emoji-id="123">😊</tg-emoji>');
  await act(async () => handle.current!.deleteBackward());
  expect(onChange).toHaveBeenLastCalledWith('Hi ');
  expect(editor.querySelector('img')).toBeNull();
});

it('does nothing at the beginning and never modifies a read-only draft', async () => {
  let editor = await render('Hi');
  await select(editor, editor.firstChild!, 0);
  await act(async () => handle.current!.deleteBackward()); expect(onChange).not.toHaveBeenCalled();
  editor = await render('Hi', true);
  await act(async () => { handle.current!.deleteBackward(); handle.current!.insertEmoji(emoji); });
  expect(editor.textContent).toBe('Hi'); expect(onChange).not.toHaveBeenCalled();
});

it('sends Enter and the mobile send input event, preserves Shift+Enter and IME composition', async () => {
  const editor = await render('Hi', false, false);
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  await act(async () => editor.dispatchEvent(enter));
  expect(enter.defaultPrevented).toBe(true); expect(onSend).toHaveBeenCalledOnce();
  const shift = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
  await act(async () => editor.dispatchEvent(shift)); expect(shift.defaultPrevented).toBe(false);
  await act(async () => editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })));
  await act(async () => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
  expect(onSend).toHaveBeenCalledOnce();
  const mobileSend = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
  await act(async () => editor.dispatchEvent(mobileSend));
  expect(mobileSend.defaultPrevented).toBe(true); expect(onSend).toHaveBeenCalledTimes(2);
  await render('Hi', true);
  await act(async () => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onSend).toHaveBeenCalledTimes(2);
});

it('reuses the editor for external draft changes and clears its selection after sending', async () => {
  const editor = await render('Old draft');
  await select(editor, editor.firstChild!, 3);
  await render('');
  expect(container.querySelector('[role="textbox"]')).toBe(editor);
  expect(editor.childNodes).toHaveLength(0);
  await act(async () => handle.current!.insertEmoji(emoji));
  expect(onChange).toHaveBeenLastCalledWith('<tg-emoji emoji-id="123">😊</tg-emoji>');
});

it('ignores browser selection resets while the emoji dock has keyboard ownership', async () => {
  const editor = await render('Hi there');
  await select(editor, editor.firstChild!, 3);
  await act(async () => handle.current!.insertEmoji(emoji));
  await act(async () => {
    const reset = document.createRange(); reset.selectNodeContents(editor); reset.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(reset);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await act(async () => handle.current!.insertEmoji(emoji));
  expect(onChange).toHaveBeenLastCalledWith('Hi <tg-emoji emoji-id="123">😊</tg-emoji><tg-emoji emoji-id="123">😊</tg-emoji>there');
});

it('preserves selected text when the emoji catalog finishes loading', async () => {
  const editor = await render('Hello world', false, true, []);
  await select(editor, editor.firstChild!, 6, 11);
  await render('Hello world');
  await act(async () => handle.current!.insertEmoji(emoji));
  expect(onChange).toHaveBeenLastCalledWith('Hello <tg-emoji emoji-id="123">😊</tg-emoji>');
});

it('keeps an intentional blank line in an empty draft but clears deletion filler', async () => {
  const editor = await render('', false, false);
  await act(async () => {
    editor.innerHTML = '<br>';
    editor.dispatchEvent(new InputEvent('input', { inputType: 'insertLineBreak', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith('\n');
  await act(async () => {
    editor.append(document.createTextNode('A'));
    editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'A', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith('\nA');
  await act(async () => {
    editor.innerHTML = '<br>';
    editor.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith('');
  expect(editor.childNodes).toHaveLength(0);
});

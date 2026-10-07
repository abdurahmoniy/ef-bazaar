'use client';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { EmojiItem, EmojiPackDetail } from '@/lib/emoji-packs';
import { chatTextParts, serializeChatEditor } from '@/lib/chat-custom-emoji';

export function ChatRichComposer({ value, packs, readOnly, onChange, onSend, onBlur, onPaste, registerInsert, caret, pickerOpen }: {
  value: string; packs: EmojiPackDetail[]; readOnly: boolean;
  onChange: (value: string) => void; onSend: () => void; onBlur: () => void;
  onPaste: (event: React.ClipboardEvent<HTMLElement>) => void;
  registerInsert: (insert: ((item: EmojiItem) => void) | null) => void;
  caret: RefObject<number | null>;
  pickerOpen: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const selectionRef = useRef<Range | null>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    if (value === emitted.current) return;
    const items = new Map(packs.flatMap(pack => pack.items.map(item => [item.customEmojiId, item] as const)));
    el.replaceChildren(...chatTextParts(value).map(part => {
      if (!part.emojiId) return document.createTextNode(part.text);
      const img = document.createElement('img');
      img.alt = part.text; img.dataset.emojiId = part.emojiId;
      img.src = items.get(part.emojiId)?.thumbnailUrl ?? '';
      img.className = 'chat-custom-emoji';
      img.contentEditable = 'false';
      return img;
    }));
    if (caret.current !== null) {
      let remaining = caret.current;
      const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false);
      for (const node of el.childNodes) {
        const length = node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : 1;
        if (remaining <= length) {
          if (node.nodeType === Node.TEXT_NODE) range.setStart(node, remaining);
          else if (remaining === 0) range.setStartBefore(node);
          else range.setStartAfter(node);
          range.collapse(true); break;
        }
        remaining -= length;
      }
      if (!pickerOpen) {
        el.focus({ preventScroll: true });
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      }
      selectionRef.current = range.cloneRange(); caret.current = null;
    }
  }, [value, packs, caret, pickerOpen]);
  const remember = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && ref.current?.contains(selection.anchorNode)) selectionRef.current = selection.getRangeAt(0).cloneRange();
  };
  useLayoutEffect(() => {
    registerInsert((item) => {
      if (readOnly) return;
      const el = ref.current!;
      if (!pickerOpen) el.focus({ preventScroll: true });
      const range = selectionRef.current?.cloneRange() ?? document.createRange();
      if (!el.contains(range.commonAncestorContainer)) { range.selectNodeContents(el); range.collapse(false); }
      const img = document.createElement('img');
      img.alt = item.emoji; img.dataset.emojiId = item.customEmojiId; img.src = item.thumbnailUrl;
      img.className = 'chat-custom-emoji'; img.contentEditable = 'false';
      range.deleteContents(); range.insertNode(img); range.setStartAfter(img); range.collapse(true);
      if (!pickerOpen) {
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      }
      selectionRef.current = range.cloneRange();
      emitted.current = serializeChatEditor(el); onChange(emitted.current);
    });
    return () => registerInsert(null);
  }, [onChange, readOnly, registerInsert, pickerOpen]);
  return <div ref={ref} role="textbox" aria-label="Xabar" aria-multiline="true" aria-readonly={readOnly}
    contentEditable={!readOnly} suppressContentEditableWarning
    className="min-h-11 max-h-32 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-[22px] px-3 py-2.5 text-base leading-[22px] outline-none focus-visible:ring-1 focus-visible:ring-inset sm:text-[15px]"
    onInput={() => { emitted.current = serializeChatEditor(ref.current!); onChange(emitted.current); remember(); }}
    onKeyUp={remember} onMouseUp={remember} onBlur={() => { remember(); onBlur(); }} onPaste={(event) => {
      onPaste(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    }}
    onKeyDown={(event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault(); if (!readOnly) onSend();
    }} />;
}

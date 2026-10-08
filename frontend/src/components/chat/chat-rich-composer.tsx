'use client';

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import type { EmojiItem, EmojiPackDetail } from '@/lib/emoji-packs';
import { chatTextParts, customEmojiToken, serializeChatEditor } from '@/lib/chat-custom-emoji';

export interface ChatRichComposerHandle {
  focus(): void;
  blur(): void;
  insertEmoji(item: EmojiItem): void;
  deleteBackward(): void;
}

function visibleLength(value: string) {
  return chatTextParts(value).reduce((length, part) => length + (part.emojiId ? 1 : part.text.length), 0);
}

function offsetAt(editor: HTMLElement, node: Node, offset: number) {
  const prefix = document.createRange();
  prefix.selectNodeContents(editor); prefix.setEnd(node, offset);
  const fragment = document.createElement('div'); fragment.append(prefix.cloneContents());
  return visibleLength(serializeChatEditor(fragment));
}

function rangeAt(editor: HTMLElement, offset: number) {
  const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
  for (const node of editor.childNodes) {
    const length = node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : 1;
    if (offset <= length) {
      if (node.nodeType === Node.TEXT_NODE) range.setStart(node, offset);
      else if (offset === 0) range.setStartBefore(node);
      else range.setStartAfter(node);
      range.collapse(true); break;
    }
    offset -= length;
  }
  return range;
}

function renderDraft(editor: HTMLElement, value: string, packs: EmojiPackDetail[]) {
  const items = new Map(packs.flatMap(pack => pack.items.map(item => [item.customEmojiId, item] as const)));
  editor.replaceChildren(...chatTextParts(value).map(part => {
    if (!part.emojiId) return document.createTextNode(part.text);
    const img = document.createElement('img');
    img.alt = part.text; img.dataset.emojiId = part.emojiId;
    img.src = items.get(part.emojiId)?.thumbnailUrl ?? '';
    img.className = 'chat-custom-emoji'; img.contentEditable = 'false';
    return img;
  }));
}

// Visible offsets count a custom emoji as one unit; Unicode emoji stay whole.
function draftUnits(value: string) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let offset = 0;
  return chatTextParts(value).flatMap(part => {
    const units = part.emojiId
      ? [{ raw: customEmojiToken({ customEmojiId: part.emojiId, emoji: part.text }), length: 1 }]
      : Array.from(segmenter.segment(part.text), ({ segment }) => ({ raw: segment, length: segment.length }));
    return units.map(unit => {
      const start = offset; offset += unit.length;
      return { ...unit, start, end: offset };
    });
  });
}

export function ChatRichComposer({ ref: handleRef, value, packs, readOnly, onChange, onSend, onBlur, onFocus, onPaste, pickerOpen, placeholder }: {
  ref?: Ref<ChatRichComposerHandle>;
  value: string; packs: EmojiPackDetail[]; readOnly: boolean; pickerOpen: boolean; placeholder: string;
  onChange: (value: string) => void; onSend: () => void; onBlur: () => void; onFocus: () => void;
  onPaste: (event: React.ClipboardEvent<HTMLElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const renderedPacks = useRef<EmojiPackDetail[] | null>(null);
  const selectionRef = useRef<Range | null>(null);
  const shiftEnter = useRef(false);
  const remember = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && ref.current?.contains(selection.anchorNode) && ref.current.contains(selection.focusNode)) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };
  const currentRange = () => {
    const editor = ref.current!;
    if (document.activeElement === editor) remember();
    const range = selectionRef.current?.cloneRange() ?? document.createRange();
    if (!editor.contains(range.commonAncestorContainer)) { range.selectNodeContents(editor); range.collapse(false); }
    return range;
  };
  const restoreSelection = (range: Range) => {
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
  };
  const emit = () => { emitted.current = serializeChatEditor(ref.current!); onChange(emitted.current); };
  const saveRange = (range: Range) => {
    selectionRef.current = range.cloneRange();
    if (!pickerOpen && document.activeElement === ref.current) restoreSelection(range);
  };

  useLayoutEffect(() => {
    const editor = ref.current!;
    if (value === emitted.current && packs === renderedPacks.current) return;
    // Pack refreshes update thumbnails without moving the cursor. A different
    // draft (send/edit/cancel) starts at its end rather than a stale DOM range.
    const range = currentRange();
    const sameDraft = value === emitted.current;
    const start = sameDraft ? offsetAt(editor, range.startContainer, range.startOffset) : visibleLength(value);
    const end = sameDraft ? offsetAt(editor, range.endContainer, range.endOffset) : start;
    renderDraft(editor, value, packs); renderedPacks.current = packs; emitted.current = value;
    const nextRange = rangeAt(editor, start);
    const nextEnd = rangeAt(editor, end); nextRange.setEnd(nextEnd.endContainer, nextEnd.endOffset);
    saveRange(nextRange);
  }); // Reconcile only actual value/catalog changes, including edits and sends.

  useEffect(() => {
    const trackSelection = () => { if (document.activeElement === ref.current) remember(); };
    document.addEventListener('selectionchange', trackSelection);
    return () => document.removeEventListener('selectionchange', trackSelection);
  }, []);

  useEffect(() => {
    const editor = ref.current!;
    const beforeInput = (event: InputEvent) => {
      if (event.inputType !== 'insertParagraph' || event.isComposing || shiftEnter.current) return;
      event.preventDefault(); if (!readOnly) onSend();
    };
    editor.addEventListener('beforeinput', beforeInput);
    return () => editor.removeEventListener('beforeinput', beforeInput);
  }, [onSend, readOnly]);

  useImperativeHandle(handleRef, () => ({
    focus() {
      const range = currentRange();
      ref.current!.focus({ preventScroll: true }); restoreSelection(range);
    },
    blur() { remember(); ref.current!.blur(); },
    insertEmoji(item) {
      if (readOnly) return;
      const range = currentRange();
      const fragment = document.createElement('div'); renderDraft(fragment, customEmojiToken(item), packs);
      range.deleteContents();
      const node = fragment.firstChild;
      if (!node) return;
      range.insertNode(node); range.setStartAfter(node); range.collapse(true);
      saveRange(range); emit();
    },
    deleteBackward() {
      if (readOnly) return;
      const editor = ref.current!;
      const range = currentRange();
      const start = offsetAt(editor, range.startContainer, range.startOffset);
      const end = offsetAt(editor, range.endContainer, range.endOffset);
      const units = draftUnits(serializeChatEditor(editor));
      const removed = range.collapsed
        ? units.filter(unit => unit.start < start && unit.end >= start)
        : units.filter(unit => unit.end > start && unit.start < end);
      if (!removed.length) return;
      const removedUnits = new Set(removed);
      const next = units.filter(unit => !removedUnits.has(unit)).map(unit => unit.raw).join('');
      renderDraft(editor, next, packs);
      saveRange(rangeAt(editor, removed[0].start)); emit();
    },
  }));

  return <div ref={ref} role="textbox" aria-label="Xabar" aria-multiline="true" aria-readonly={readOnly}
    contentEditable={!readOnly} suppressContentEditableWarning tabIndex={0}
    inputMode="text" enterKeyHint="send" autoCapitalize="sentences" autoCorrect="on" spellCheck
    data-placeholder={placeholder} aria-placeholder={placeholder}
    className="chat-composer-editor min-h-11 max-h-32 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-[22px] px-3 py-2.5 text-base leading-[22px] outline-none sm:text-[15px]"
    onFocus={onFocus}
    onInput={(event) => {
      const editor = ref.current!;
      // Remove deletion filler, while preserving intentional blank lines.
      const inputType = (event.nativeEvent as InputEvent).inputType;
      if (inputType?.startsWith('delete') && !editor.textContent && !editor.querySelector('img')) editor.replaceChildren();
      emit(); remember();
    }}
    onKeyUp={() => { shiftEnter.current = false; remember(); }} onMouseUp={remember}
    onBlur={() => { remember(); onBlur(); }} onPaste={(event) => {
      onPaste(event); if (event.defaultPrevented) return;
      event.preventDefault(); if (readOnly) return;
      const range = currentRange(); const node = document.createTextNode(event.clipboardData.getData('text/plain'));
      range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
      saveRange(range); emit();
    }}
    onKeyDown={(event) => {
      shiftEnter.current = event.key === 'Enter' && event.shiftKey;
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault(); if (!readOnly) onSend();
    }} />;
}

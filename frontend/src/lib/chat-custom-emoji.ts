import type { EmojiItem } from './emoji-packs';

export type ChatTextPart = { text: string; emojiId?: string };
const pattern = /<tg-emoji emoji-id="(\d{1,32})">([^<>]*)<\/tg-emoji>/g;
export function chatTextParts(content: string): ChatTextPart[] {
  const parts: ChatTextPart[] = [];
  let start = 0;
  for (const match of content.matchAll(pattern)) {
    if (match.index > start) parts.push({ text: content.slice(start, match.index) });
    parts.push({ emojiId: match[1], text: match[2] });
    start = match.index + match[0].length;
  }
  if (start < content.length) parts.push({ text: content.slice(start) });
  return parts;
}
export function chatPlainText(content: string): string {
  return chatTextParts(content).map(part => part.text).join('');
}
export function customEmojiToken(item: Pick<EmojiItem, 'customEmojiId' | 'emoji'>): string {
  if (!/^\d{1,32}$/.test(item.customEmojiId) || /[<>]/.test(item.emoji)) return item.emoji;
  return `<tg-emoji emoji-id="${item.customEmojiId}">${item.emoji}</tg-emoji>`;
}
export function serializeChatEditor(root: HTMLElement): string {
  const visit = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    if (node.tagName === 'IMG') return customEmojiToken({ customEmojiId: node.dataset.emojiId ?? '', emoji: node.getAttribute('alt') ?? '' });
    if (node.tagName === 'BR') return '\n';
    const text = Array.from(node.childNodes).map(visit).join('');
    return (node.tagName === 'DIV' || node.tagName === 'P') && node !== root ? `\n${text}` : text;
  };
  return Array.from(root.childNodes).map(visit).join('');
}

'use client';
import type { EmojiPackDetail } from '@/lib/emoji-packs';
import { chatTextParts } from '@/lib/chat-custom-emoji';

export function ChatMessageContent({ content, packs }: { content: string; packs: EmojiPackDetail[] }) {
  const items = new Map(packs.flatMap(pack => pack.items.map(item => [item.customEmojiId, item] as const)));
  return chatTextParts(content).map((part, index) => {
    const item = part.emojiId ? items.get(part.emojiId) : undefined;
    if (!item) return part.text;
    if (item.format === 'video') return <video key={index} className="chat-custom-emoji" src={item.fileUrl} poster={item.thumbnailUrl} autoPlay loop muted playsInline aria-label={part.text} />;
    // TGS needs a Lottie decoder; retain the pack's thumbnail for that format.
    // eslint-disable-next-line @next/next/no-img-element
    return <img key={index} className="chat-custom-emoji" src={item.format === 'static' ? item.fileUrl : item.thumbnailUrl} alt={part.text} onError={(event) => {
      if (event.currentTarget.dataset.fallback) return;
      event.currentTarget.dataset.fallback = 'true';
      event.currentTarget.src = item.thumbnailUrl;
    }} />;
  });
}

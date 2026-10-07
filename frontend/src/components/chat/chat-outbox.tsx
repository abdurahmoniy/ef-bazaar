'use client';
import { LoaderCircle, RotateCcw, X } from 'lucide-react';
import { ChatMessageContent } from './chat-message-content';
import { chatPlainText } from '@/lib/chat-custom-emoji';
import type { EmojiPackDetail } from '@/lib/emoji-packs';
import type { OutboxEntry } from '@/hooks/use-chat-outbox';

export function ChatOutbox({ entries, onRetry, onDismiss, packs = [] }: { packs?: EmojiPackDetail[]; entries: OutboxEntry[]; onRetry: (id: string) => void; onDismiss: (id: string) => void }) {
  return entries.map(entry => <div key={entry.clientMessageId} data-outbox-id={entry.clientMessageId}
    className="chat-message-entry mx-auto mt-3 flex max-w-3xl justify-end" data-new="true">
    <div className="chat-message-bubble px-3 py-2 text-left" data-mine="true" data-group-start="true" data-group-end="true">
      {entry.replyTo && <div className="chat-message-reply mb-1.5 border-l-[3px] px-2 text-xs">{chatPlainText(entry.replyTo.content) || entry.replyTo.attachmentName}</div>}
      {entry.file && <div className="text-xs font-medium">{entry.voice ? 'Ovozli xabar' : entry.file.name}</div>}
      <span className="whitespace-pre-wrap break-words">{<ChatMessageContent content={entry.content} packs={packs} />}</span>
      {entry.status === 'sending' ? <span role="status" className="mt-1 flex items-center justify-end gap-1 text-[11px] opacity-70">
        <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />Yuborilmoqda…
      </span> : <div className="mt-1 text-xs">
        <p role="status" className="break-words">Yuborilmadi. {entry.error}</p>
        <button type="button" aria-label="Xabarni qayta yuborish" className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onRetry(entry.clientMessageId)}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Qayta yuborish</button>
        <button type="button" aria-label="Yuborilmagan xabarni o‘chirish" className="ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onDismiss(entry.clientMessageId)}><X className="h-3.5 w-3.5" aria-hidden="true" />O‘chirish</button>
      </div>}
    </div>
  </div>);
}

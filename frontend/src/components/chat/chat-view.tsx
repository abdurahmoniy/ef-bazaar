'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  Send,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';

import { ChatPinnedHeader } from '@/components/chat/chat-pinned-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { avatarTone, partnerInitial, partnerName } from '@/lib/chat-format';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { formatListingDate } from '@/lib/marketplace-format';
import type {
  ChatResponse,
  ListingResponse,
  MessageResponse,
  PageResponse,
} from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface ChatViewProps {
  chat: ChatResponse;
  viewerId: string;
  initialMessages: MessageResponse[];
  listing: ListingResponse | null;
}

const POLL_INTERVAL_MS = 5000;

export function ChatView({ chat: initialChat, viewerId, initialMessages, listing }: ChatViewProps) {
  const router = useRouter();
  const [chat, setChat] = useState(initialChat);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSend] = useTransition();
  const [isUpdating, startUpdate] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  const isClosed = chat.status !== 'ACTIVE';
  const name = partnerName(chat, viewerId);
  const partnerId = chat.sellerId === viewerId ? chat.buyerId : chat.sellerId;
  const roleLabel = chat.sellerId === viewerId ? 'Xaridor' : 'Sotuvchi';

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    if (isClosed) return;
    let cancelled = false;
    const tick = async () => {
      const page = await fetchMessages(chat.id);
      if (cancelled || !page) return;
      setMessages((prev) => mergeMessages(prev, page.content));
    };
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chat.id, isClosed]);

  function handleSend() {
    const content = draft.trim();
    if (!content) return;
    setError(null);
    startSend(async () => {
      const result = await sendMessage(chat.id, content);
      if (!result.ok) {
        setError(result.error ?? 'Yuborilmadi');
        return;
      }
      setDraft('');
      setMessages((prev) => mergeMessages(prev, [result.message]));
    });
  }

  function handleToggleImportant() {
    setError(null);
    startUpdate(async () => {
      const result = await toggleImportant(chat.id);
      if (!result.ok) {
        setError(result.error ?? "Muhim belgisi o'zgarmadi");
        return;
      }
      setChat(result.chat);
      router.refresh();
    });
  }

  function handleClose() {
    if (!confirm('Chatni yopmoqchimisiz? Yopilgan chatga yozib bo\'lmaydi.')) return;
    setError(null);
    startUpdate(async () => {
      const result = await closeChat(chat.id);
      if (!result.ok) {
        setError(result.error ?? 'Chat yopilmadi');
        return;
      }
      setChat(result.chat);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background animate-in slide-in-from-right duration-300 md:animate-none">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-2 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:pt-2">
        <Button asChild variant="ghost" size="sm" className="-ml-1 h-10 w-10 shrink-0 p-0 md:hidden">
          <Link href="/chats" aria-label="Chatlar ro'yxatiga qaytish">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold uppercase',
            avatarTone(partnerId),
          )}
        >
          {partnerInitial(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-black text-foreground">{name}</p>
            {chat.important && <Badge variant="warn">Muhim</Badge>}
            {isClosed && (
              <Badge variant="muted" className="uppercase">
                {chat.status.toLowerCase()}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {roleLabel} · {messages.length} xabar
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0"
            disabled={isUpdating}
            onClick={handleToggleImportant}
            title={chat.important ? "Muhimni olib tashlash" : 'Muhim deb belgilash'}
            aria-label={chat.important ? "Muhimni olib tashlash" : 'Muhim deb belgilash'}
          >
            {chat.important ? <StarOff className="h-5 w-5" /> : <Star className="h-5 w-5" />}
          </Button>
          {!isClosed && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isUpdating}
              onClick={handleClose}
              title="Chatni yakunlash"
              aria-label="Chatni yakunlash"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
        </div>
      </header>

      <div
        ref={listRef}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-4"
      >
        <ChatPinnedHeader listing={listing} />
        {messages.length === 0 && (
          <p className="pt-4 text-center text-xs text-muted-foreground">
            Hali xabarlar yo'q. Birinchi bo'lib salom bering.
          </p>
        )}
        {messages.map((message) => {
          const mine = message.senderId === viewerId;
          return (
            <div
              key={message.id}
              className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}
            >
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                  mine
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md bg-muted text-foreground',
                )}
              >
                {message.content}
              </div>
              <span className="mt-0.5 text-[10px] text-muted-foreground">
                {formatListingDate(message.createdAt)}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{error}</span>
        </div>
      )}

      {isClosed ? (
        <div className="border-t border-border bg-muted/40 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] text-center text-xs text-muted-foreground">
          Chat yopilgan — yangi xabar yuborib bo'lmaydi.
        </div>
      ) : (
        <div className="border-t border-border bg-card px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Xabar yozing…"
              rows={2}
              className="min-h-11 resize-none"
              disabled={isSending}
            />
            <Button
              type="button"
              size="lg"
              className="h-11 shrink-0"
              onClick={handleSend}
              disabled={isSending || draft.trim().length === 0}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 hidden text-[10px] text-muted-foreground md:block">
            Enter — yuborish · Shift+Enter — yangi qator
          </p>
        </div>
      )}
    </div>
  );
}

function mergeMessages(prev: MessageResponse[], next: MessageResponse[]) {
  const map = new Map<string, MessageResponse>();
  for (const m of prev) map.set(m.id, m);
  for (const m of next) map.set(m.id, m);
  return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function fetchMessages(chatId: string): Promise<PageResponse<MessageResponse> | null> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'messages']) + '?size=200&sort=createdAt,asc',
    { credentials: 'include', headers: { Accept: 'application/json' } },
  );
  if (!response.ok) return null;
  return (await response.json()) as PageResponse<MessageResponse>;
}

type SendResult =
  | { ok: true; message: MessageResponse }
  | { ok: false; error: string };

async function sendMessage(chatId: string, content: string): Promise<SendResult> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'messages']),
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ content }),
    },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  const message = (await response.json()) as MessageResponse;
  return { ok: true, message };
}

type ChatResult =
  | { ok: true; chat: ChatResponse }
  | { ok: false; error: string };

async function toggleImportant(chatId: string): Promise<ChatResult> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'important']),
    { method: 'POST', credentials: 'include' },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return { ok: true, chat: (await response.json()) as ChatResponse };
}

async function closeChat(chatId: string): Promise<ChatResult> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'close']),
    { method: 'POST', credentials: 'include' },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return { ok: true, chat: (await response.json()) as ChatResponse };
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.error === 'string') return payload.error;
  } catch {
    // ignore
  }
  return response.status === 401 || response.status === 403
    ? 'Kirish talab qilinadi'
    : "So'rov bajarilmadi";
}

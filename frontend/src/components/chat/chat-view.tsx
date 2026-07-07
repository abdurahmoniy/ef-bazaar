'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  Paperclip,
  Pencil,
  Reply,
  Send,
  Star,
  StarOff,
  Trash2,
  X,
} from 'lucide-react';

import { ChatPinnedHeader } from '@/components/chat/chat-pinned-header';
import { MessageActionSheet } from '@/components/chat/message-action-sheet';
import { MessageAttachment, formatBytes } from '@/components/chat/message-attachment';
import { VoiceRecorder } from '@/components/chat/voice-recorder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  avatarTone,
  formatDayLabel,
  formatMessageTime,
  partnerInitial,
  partnerName,
  uzDayKey,
} from '@/lib/chat-format';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [actionTarget, setActionTarget] = useState<MessageResponse | null>(null);
  const [replyTo, setReplyTo] = useState<MessageResponse | null>(null);
  const [editing, setEditing] = useState<MessageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSend] = useTransition();
  const [isUpdating, startUpdate] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isClosed = chat.status !== 'ACTIVE';
  const name = partnerName(chat, viewerId);
  const partnerId = chat.sellerId === viewerId ? chat.buyerId : chat.sellerId;

  // Snapshot of my read cursor at open time — the "Yangi xabarlar" divider
  // stays anchored there even though markChatRead advances the real cursor.
  const [newSince] = useState(() => initialChat.lastReadAt ?? null);
  const firstUnreadId = newSince
    ? messages.find((m) => m.senderId !== viewerId && m.createdAt > newSince)?.id
    : undefined;

  // On open: move the cursor, then router.refresh() so the chats-list layout
  // (which persists across client navigations) refetches and clears this
  // chat's unread badge.
  useEffect(() => {
    let cancelled = false;
    markChatRead(chat.id).then(() => {
      if (!cancelled) router.refresh();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  // Keep the cursor current while the chat stays on screen (new messages
  // landing via polling; own sends included — harmless, one POST per change).
  useEffect(() => {
    if (messages.length > 0) markChatRead(chat.id);
  }, [chat.id, messages.length]);

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
      // Single-page fetch covers the whole history → treat the server as the
      // source of truth so partner-side deletions and edits propagate; fall
      // back to merge only when history is longer than one page.
      setMessages((prev) =>
        page.totalPages <= 1 ? page.content : mergeMessages(prev, page.content),
      );
    };
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chat.id, isClosed]);

  function handleSend() {
    const content = draft.trim();
    if (!content && !pendingFile) return;
    setError(null);
    startSend(async () => {
      if (editing) {
        const result = await editMessage(chat.id, editing.id, content);
        if (!result.ok) {
          setError(result.error ?? 'Tahrirlanmadi');
          return;
        }
        setDraft('');
        setEditing(null);
        setMessages((prev) => prev.map((m) => (m.id === result.message.id ? result.message : m)));
        return;
      }
      const result = pendingFile
        ? await sendAttachment(chat.id, pendingFile, content)
        : await sendMessage(chat.id, content, replyTo?.id ?? null);
      if (!result.ok) {
        setError(result.error ?? 'Yuborilmadi');
        return;
      }
      setDraft('');
      setPendingFile(null);
      setReplyTo(null);
      setMessages((prev) => mergeMessages(prev, [result.message]));
    });
  }

  // ----- message actions (Telegram-style sheet) -----

  function startReply(message: MessageResponse) {
    setActionTarget(null);
    setEditing(null);
    setReplyTo(message);
  }

  function startEdit(message: MessageResponse) {
    setActionTarget(null);
    setReplyTo(null);
    setPendingFile(null);
    setEditing(message);
    setDraft(message.content);
  }

  function cancelComposerMode() {
    if (editing) setDraft('');
    setEditing(null);
    setReplyTo(null);
  }

  async function handleCopyMessage(message: MessageResponse) {
    setActionTarget(null);
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      setError("Nusxa olib bo'lmadi");
    }
  }

  function handleDeleteMessage(message: MessageResponse) {
    setActionTarget(null);
    if (!confirm("Xabarni o'chirmoqchimisiz? U ikkala tarafdan ham o'chadi.")) return;
    setError(null);
    startUpdate(async () => {
      const result = await deleteMessage(chat.id, message.id);
      if (!result.ok) {
        setError(result.error ?? "Xabar o'chirilmadi");
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      if (replyTo?.id === message.id) setReplyTo(null);
      if (editing?.id === message.id) cancelComposerMode();
    });
  }

  function handlePickFile(file: File | null) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Fayl hajmi 10MB dan oshmasligi kerak');
      return;
    }
    setError(null);
    setPendingFile(file);
  }

  function handleSendVoice(file: File) {
    setError(null);
    startSend(async () => {
      const result = await sendAttachment(chat.id, file, '', true);
      if (!result.ok) {
        setError(result.error ?? 'Yuborilmadi');
        return;
      }
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

  function handleDelete() {
    if (
      !confirm(
        "Chatni o'chirmoqchimisiz? U faqat sizning ro'yxatingizdan o'chadi — " +
          'suhbatdoshingizda saqlanib qoladi.',
      )
    )
      return;
    setError(null);
    startUpdate(async () => {
      const result = await hideChat(chat.id);
      if (!result.ok) {
        setError(result.error ?? "Chat o'chirilmadi");
        return;
      }
      router.push('/chats');
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
            {messages.length} xabar
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isUpdating}
            onClick={handleDelete}
            title="Chatni o'chirish"
            aria-label="Chatni o'chirish"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
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
        {messages.map((message, index) => {
          const mine = message.senderId === viewerId;
          const hasAttachment = Boolean(message.attachmentType && message.attachmentFileId);
          const prev = index > 0 ? messages[index - 1] : null;
          const newDay = !prev || uzDayKey(prev.createdAt) !== uzDayKey(message.createdAt);
          return (
            <div key={message.id}>
              {newDay && (
                <div className="my-3 flex justify-center" role="separator">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10.5px] font-bold text-muted-foreground">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              {message.id === firstUnreadId && (
                <div className="my-3 flex items-center gap-3" role="separator">
                  <span className="h-px flex-1 bg-primary/30" />
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-primary">
                    Yangi xabarlar
                  </span>
                  <span className="h-px flex-1 bg-primary/30" />
                </div>
              )}
              <div
                className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setActionTarget(message)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setActionTarget(message);
                  }}
                  className={cn(
                    'max-w-[80%] cursor-pointer rounded-2xl text-left text-sm whitespace-pre-wrap break-words',
                    hasAttachment && message.attachmentType === 'IMAGE' ? 'p-1' : 'px-3 py-2',
                    mine
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md bg-muted text-foreground',
                  )}
                >
                  {message.replyToId && (
                    <span
                      className={cn(
                        'mb-1 block rounded-lg border-l-2 px-2 py-1 text-[11.5px]',
                        mine
                          ? 'border-primary-foreground/60 bg-white/10 text-primary-foreground/90'
                          : 'border-primary bg-primary/5 text-muted-foreground',
                      )}
                    >
                      <span className="block font-bold">
                        {message.replySenderId === viewerId ? 'Siz' : name}
                      </span>
                      <span className="block truncate">
                        {message.replyPreview ?? "O'chirilgan xabar"}
                      </span>
                    </span>
                  )}
                  {hasAttachment && (
                    // Media controls (lightbox, play, download) must not open
                    // the message action sheet.
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                    <span className="block" onClick={(e) => e.stopPropagation()}>
                      <MessageAttachment message={message} mine={mine} />
                    </span>
                  )}
                  {message.content && (
                    <span className={cn('block', hasAttachment && 'px-2 pb-1 pt-1.5')}>
                      {message.content}
                    </span>
                  )}
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatMessageTime(message.createdAt)}
                  {message.editedAt && ' · tahrirlangan'}
                </span>
              </div>
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
          {(replyTo || editing) && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              {editing ? (
                <Pencil className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Reply className="h-4 w-4 shrink-0 text-primary" />
              )}
              <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
                <p className="text-[10.5px] font-bold text-primary">
                  {editing
                    ? 'Tahrirlash'
                    : (replyTo?.senderId === viewerId ? 'Siz' : name) + 'ga javob'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {(editing ?? replyTo)?.content.trim() ||
                    (editing ?? replyTo)?.attachmentName ||
                    'Xabar'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                onClick={cancelComposerMode}
                aria-label="Bekor qilish"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {pendingFile && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              {pendingFile.type.startsWith('image/') && (
                <img
                  src={URL.createObjectURL(pendingFile)}
                  alt=""
                  className="h-10 w-10 rounded-md object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {pendingFile.name}
                </p>
                <p className="text-[10.5px] text-muted-foreground">
                  {formatBytes(pendingFile.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                onClick={() => setPendingFile(null)}
                aria-label="Faylni olib tashlash"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                handlePickFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            {!isRecording && (
              <>
                {!editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="h-11 w-11 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSending}
                    title="Fayl biriktirish"
                    aria-label="Fayl biriktirish"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                )}
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  onPaste={(e) => {
                    if (editing) return;
                    const item = Array.from(e.clipboardData.items).find(
                      (i) => i.kind === 'file' && i.type.startsWith('image/'),
                    );
                    const file = item?.getAsFile();
                    if (file) {
                      e.preventDefault();
                      handlePickFile(file);
                    }
                  }}
                  placeholder={pendingFile ? 'Izoh (ixtiyoriy)…' : 'Xabar yozing…'}
                  rows={2}
                  className="min-h-11 resize-none"
                  disabled={isSending}
                />
              </>
            )}
            {draft.trim().length === 0 && !pendingFile && !editing && !replyTo ? (
              <VoiceRecorder
                disabled={isSending}
                onSend={handleSendVoice}
                onError={setError}
                recording={isRecording}
                onRecordingChange={setIsRecording}
              />
            ) : (
              <Button
                type="button"
                size="lg"
                className="h-11 shrink-0"
                onClick={handleSend}
                disabled={isSending}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-1 hidden text-[10px] text-muted-foreground md:block">
            Enter — yuborish · Shift+Enter — yangi qator
          </p>
        </div>
      )}

      {actionTarget && (
        <MessageActionSheet
          message={actionTarget}
          mine={actionTarget.senderId === viewerId}
          onReply={() => startReply(actionTarget)}
          onCopy={() => handleCopyMessage(actionTarget)}
          onEdit={() => startEdit(actionTarget)}
          onDelete={() => handleDeleteMessage(actionTarget)}
          onClose={() => setActionTarget(null)}
        />
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

async function sendMessage(
  chatId: string,
  content: string,
  replyToId: string | null = null,
): Promise<SendResult> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'messages']),
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(replyToId ? { content, replyToId } : { content }),
    },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  const message = (await response.json()) as MessageResponse;
  return { ok: true, message };
}

async function editMessage(
  chatId: string,
  messageId: string,
  content: string,
): Promise<SendResult> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'messages', messageId]),
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ content }),
    },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  const message = (await response.json()) as MessageResponse;
  return { ok: true, message };
}

async function deleteMessage(
  chatId: string,
  messageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'messages', messageId]),
    { method: 'DELETE', credentials: 'include' },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return { ok: true };
}

async function sendAttachment(
  chatId: string,
  file: File,
  caption: string,
  voice = false,
): Promise<SendResult> {
  const form = new FormData();
  form.append('file', file);
  if (caption) form.append('caption', caption);
  if (voice) form.append('voice', 'true');
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'messages', 'attachments']),
    { method: 'POST', credentials: 'include', body: form },
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

/** Fire-and-forget read-cursor bump — failures self-heal on the next call. */
async function markChatRead(chatId: string): Promise<void> {
  try {
    await fetch(buildMarketplaceApiPath(['v1', 'chats', chatId, 'read']), {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // ignore
  }
}

type HideResult = { ok: true } | { ok: false; error: string };

async function hideChat(chatId: string): Promise<HideResult> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'hide']),
    { method: 'POST', credentials: 'include' },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return { ok: true };
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

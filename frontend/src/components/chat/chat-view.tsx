'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  Check,
  ChevronLeft,
  LoaderCircle,
  Keyboard,
  MessageCircle,
  Paperclip,
  Pencil,
  Reply,
  Send,
  Smile,
  Search,
  Star,
  X,
} from 'lucide-react';

import { ChatTemplatePicker } from '@/components/chat/chat-template-picker';
import { ChatSearch } from '@/components/chat/chat-search';
import { ChatOutbox } from '@/components/chat/chat-outbox';
import { useChatOutbox } from '@/hooks/use-chat-outbox';
import { useChatMessageNavigation } from '@/hooks/use-chat-message-navigation';
import { ChatEmojiPicker } from '@/components/chat/chat-emoji-picker';
import { ChatRichComposer, type ChatRichComposerHandle } from './chat-rich-composer';
import { useChatKeyboardHeight } from '@/hooks/use-chat-keyboard-height';
import { useChatViewport } from '@/hooks/use-chat-viewport';
import { ChatMessageContent } from './chat-message-content';
import { useEmojiPacks } from '@/lib/use-emoji-packs';
import type { EmojiItem } from '@/lib/emoji-packs';
import { chatPlainText } from '@/lib/chat-custom-emoji';
import { ChatActivityStatus, MessageReadReceipt } from '@/components/chat/chat-activity-status';
import { useChatConnection } from '@/hooks/use-chat-connection';
import { getChatSocket } from '@/lib/chat-socket';
import { useChatActivity } from '@/hooks/use-chat-activity';
import { ChatOptions } from '@/components/chat/chat-options';
import { TouchMessageBubble } from './touch-message-bubble';
import { MediaLightbox } from './media-lightbox';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { MessageActionSheet } from '@/components/chat/message-action-sheet';
import { TradeProvider, useTradeContext } from '@/components/chat/trade-context';
import { TradePinnedBar } from '@/components/chat/trade-pinned-bar';
import { TradePanel } from '@/components/chat/trade-panel';
import { TradeProposalMessageCard } from '@/components/chat/trade-proposal-message-card';
import { MessageAttachment, formatBytes } from '@/components/chat/message-attachment';
import { VoiceRecorder } from '@/components/chat/voice-recorder';
import { Button } from '@/components/ui/button';
import { useChatDraft } from '@/hooks/use-chat-draft';
import { useChatScroll } from '@/hooks/use-chat-scroll';
import {
  avatarTone,
  formatDayLabel,
  formatMessageTime,
  partnerInitial,
  partnerName,
  uzDayKey,
} from '@/lib/chat-format';
import { canGroupMessages } from '@/lib/chat-message-grouping';
import { ChatRequestError, chatDetailsOptions, chatInboxOptions, chatKeys, chatMessagesOptions, commitChatMessages, invalidateChatInbox, markCachedChatRead, mergeMessages } from '@/lib/chat-cache';
import type {
  ChatResponse,
  ListingResponse,
  MessageResponse,
} from '@/lib/marketplace-types';
import type { PendingProposalResponse } from '@/lib/trade-types';
import { cn } from '@/lib/utils';
import './chat-conversation.css';

interface ChatViewProps {
  chat: ChatResponse;
  viewerId: string;
  initialMessages: MessageResponse[];
  initialMessagesComplete: boolean;
  initialFetchedAt: number;
  listing: ListingResponse | null;
  initialPendingProposal?: PendingProposalResponse | null;
}

export function ChatView({
  chat: initialChat,
  viewerId,
  initialMessages,
  initialMessagesComplete,
  initialFetchedAt,
  listing,
  initialPendingProposal = null,
}: ChatViewProps) {
  const router = useRouter();
  const { connected, networkOnline } = useChatConnection(viewerId);
  const queryClient = useQueryClient();
  const [chat, setChat] = useState(() => {
    const inboxKey = chatKeys.inbox(viewerId);
    if ((queryClient.getQueryState(inboxKey)?.dataUpdatedAt ?? 0) > initialFetchedAt) {
      return queryClient.getQueryData<ChatResponse[]>(inboxKey)?.find(item => item.id === initialChat.id) ?? initialChat;
    }
    return initialChat;
  });
  const { data: liveChat } = useQuery({
    ...chatDetailsOptions(viewerId, initialChat.id),
    initialData: chat,
    initialDataUpdatedAt: Math.max(initialFetchedAt, queryClient.getQueryState(chatKeys.inbox(viewerId))?.dataUpdatedAt ?? 0),
  });
  useEffect(() => { setChat(liveChat); }, [liveChat]);
  // The mounted conversation also needs deletion updates from the inbox. A
  // cached route must never restore a history cutoff older than one we know.
  const { data: inbox } = useQuery({ ...chatInboxOptions(viewerId), enabled: false });
  const cachedChat = inbox?.find(item => item.id === chat.id);
  const [knownClearedAt, setKnownClearedAt] = useState<string | null>(null);
  const clearedAt = [knownClearedAt, chat.clearedAt, initialChat.clearedAt, cachedChat?.clearedAt]
    .reduce<string | null>((latest, value) => value && (!latest || Date.parse(value) > Date.parse(latest)) ? value : latest, null);
  useEffect(() => {
    setKnownClearedAt(clearedAt);
  }, [clearedAt]);
  const messagesQuery = useQuery({
    ...chatMessagesOptions(queryClient, viewerId, initialChat.id),
    initialData: initialMessages,
    initialDataUpdatedAt: initialMessagesComplete ? initialFetchedAt : 0,
    retry: false,
    refetchOnWindowFocus: query => !(query.state.error instanceof ChatRequestError && query.state.error.permanent),
    refetchOnReconnect: query => !(query.state.error instanceof ChatRequestError && query.state.error.permanent),
  });
  const messages = messagesQuery.data;
  const outbox = useChatOutbox(viewerId, chat.id, messages);
  const [searchOpen, setSearchOpen] = useState(false);
  const initialMessageIds = useRef(new Set(messages.map(message => message.id)));
  const { activity, lastReadAt: partnerLastReadAt, setTyping } = useChatActivity(chat.id, viewerId);

  // Fresh server renders may improve the cache; an older cached route must not
  // replace messages received or changed after that route was first rendered.
  useEffect(() => {
    const key = chatKeys.messages(viewerId, initialChat.id);
    const cachedUpdatedAt = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;
    if (initialFetchedAt > cachedUpdatedAt) {
      queryClient.setQueryData<MessageResponse[]>(key, previous => initialMessagesComplete
        ? initialMessages
        : mergeMessages(previous ?? [], initialMessages), {
        // A partial server page must neither truncate later cached messages nor
        // mark their untouched content fresh. A partial-only seed refetches now.
        updatedAt: initialMessagesComplete ? initialFetchedAt : cachedUpdatedAt,
      });
    }
  }, [initialChat.id, initialFetchedAt, initialMessages, initialMessagesComplete, queryClient, viewerId]);

  const setMessages = (update: (previous: MessageResponse[]) => MessageResponse[]) =>
    commitChatMessages(queryClient, viewerId, initialChat.id, update);
  const [savedDraft, setSavedDraft, clearSubmittedDraft] = useChatDraft(viewerId, initialChat.id);
  const [editDraft, setEditDraft] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [imageId, setImageId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageResponse | null>(null);
  const [replyTo, setReplyTo] = useState<MessageResponse | null>(null);
  const [editing, setEditing] = useState<MessageResponse | null>(null);
  const draft = editing ? editDraft : savedDraft;
  const setDraft = editing ? setEditDraft : setSavedDraft;
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSend] = useTransition();
  const [isUpdating, startUpdate] = useTransition();
  const { listRef, onScroll, scrollToBottom, hasNewMessages, followNextMessage, stopFollowing } = useChatScroll(`${messages.at(-1)?.id ?? ''}:${outbox.entries.at(-1)?.clientMessageId ?? ''}`);
  const { jumpToMessage, highlightedMessageId } = useChatMessageNavigation(listRef, stopFollowing);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<ChatRichComposerHandle>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiCatalog = useEmojiPacks('chat');
  const emojiHeight = useChatKeyboardHeight();
  const viewport = useChatViewport();

  function insertEmoji(item: EmojiItem) {
    if (isSending) return;
    composerRef.current?.insertEmoji(item);
    setTyping(!editing);
  }

  function showKeyboard() {
    // Focus synchronously in the tap gesture: iOS rejects delayed keyboard focus.
    composerRef.current?.focus();
    setEmojiOpen(false);
  }

  function handleComposerPaste(e: React.ClipboardEvent<HTMLElement>) {
    if (isSending) { e.preventDefault(); return; }
    if (editing) return;
    const item = Array.from(e.clipboardData.items).find(
      (candidate) => candidate.kind === 'file' && candidate.type.startsWith('image/'),
    );
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      handlePickFile(file);
    }
  }

  const name = partnerName(chat, viewerId);
  const partnerId = chat.sellerId === viewerId ? chat.buyerId : chat.sellerId;

  // Snapshot of my read cursor at open time — the "Yangi xabarlar" divider
  // stays anchored there even though markChatRead advances the real cursor.
  const [newSince] = useState(() => initialChat.lastReadAt ?? null);
  const firstUnreadId = newSince
    ? messages.find((m) => m.senderId !== viewerId && m.createdAt > newSince)?.id
    : undefined;

  // Acknowledge only received messages actually reached in a visible chat.
  const lastIncomingId = messages.reduce<string | undefined>((id, message) => message.senderId !== viewerId ? message.id : id, undefined);
  const acknowledgedMessage = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const list = listRef.current;
    const markVisible = () => {
      if (!lastIncomingId || acknowledgedMessage.current === lastIncomingId || inFlight
        || document.visibilityState !== 'visible' || !document.hasFocus() || !navigator.onLine
        || !list || list.scrollHeight - list.clientHeight - list.scrollTop > 8) return;
      inFlight = true;
      void markChatRead(viewerId, chat.id, lastIncomingId).then(ok => {
        inFlight = false;
        if (ok && !cancelled) {
          acknowledgedMessage.current = lastIncomingId;
          void markCachedChatRead(queryClient, viewerId, chat.id);
        }
      });
    };
    markVisible();
    list?.addEventListener('scroll', markVisible, { passive: true });
    document.addEventListener('visibilitychange', markVisible);
    window.addEventListener('focus', markVisible);
    window.addEventListener('online', markVisible);
    return () => {
      cancelled = true;
      list?.removeEventListener('scroll', markVisible);
      document.removeEventListener('visibilitychange', markVisible);
      window.removeEventListener('focus', markVisible);
      window.removeEventListener('online', markVisible);
    };
  }, [chat.id, lastIncomingId, listRef, messagesQuery.dataUpdatedAt, queryClient, viewerId]);

  function handleSend() {
    if (isSending) return;
    const content = draft.trim();
    if (!content && !pendingFile) return;
    setTyping(false);
    setError(null);
    if (!editing) {
      outbox.send({ content, file: pendingFile, replyTo });
      clearSubmittedDraft(draft);
      setPendingFile(null);
      setReplyTo(null);
      followNextMessage();
      return;
    }
    startSend(async () => {
      if (editing) {
        const result = await editMessage(viewerId, chat.id, editing.id, content);
        if (!result.ok) {
          setError(result.error ?? 'Tahrirlanmadi');
          return;
        }
        setDraft('');
        setEditing(null);
        await setMessages((prev) => prev.map((m) => (m.id === result.message.id ? result.message : m)));
        return;
      }
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
    setEditDraft(message.content);
  }

  function cancelComposerMode() {
    setEditDraft('');
    setEditing(null);
    setReplyTo(null);
  }

  async function handleCopyMessage(message: MessageResponse) {
    setActionTarget(null);
    try {
      await navigator.clipboard.writeText(chatPlainText(message.content));
    } catch {
      setError("Nusxa olib bo'lmadi");
    }
  }

  function handleDeleteMessage(message: MessageResponse) {
    setActionTarget(null);
    if (!confirm("Xabarni o'chirmoqchimisiz? U ikkala tarafdan ham o'chadi.")) return;
    setError(null);
    startUpdate(async () => {
      const result = await deleteMessage(viewerId, chat.id, message.id);
      if (!result.ok) {
        setError(result.error ?? "Xabar o'chirilmadi");
        return;
      }
      await setMessages((prev) => prev.filter((m) => m.id !== message.id));
      if (replyTo?.id === message.id) setReplyTo(null);
      if (editing?.id === message.id) cancelComposerMode();
    });
  }

  function handlePickFile(file: File | null) {
    if (!file || isSending) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Fayl hajmi 10MB dan oshmasligi kerak');
      return;
    }
    setError(null);
    setPendingFile(file);
  }

  function handleSendVoice(file: File) {
    setError(null);
    outbox.send({ content: '', file, voice: true, replyTo });
    setReplyTo(null);
    followNextMessage();
  }

  function handleToggleImportant() {
    setError(null);
    startUpdate(async () => {
      const result = await toggleImportant(viewerId, chat.id);
      if (!result.ok) {
        setError(result.error ?? "Muhim belgisi o'zgarmadi");
        return;
      }
      setChat(result.chat);
      await queryClient.cancelQueries({ queryKey: chatKeys.details(viewerId, chat.id) });
      queryClient.setQueryData(chatKeys.details(viewerId, chat.id), result.chat);
      await queryClient.cancelQueries({ queryKey: chatKeys.inbox(viewerId) });
      queryClient.setQueryData<ChatResponse[]>(chatKeys.inbox(viewerId), previous =>
        previous?.map(item => item.id === chat.id ? result.chat : item),
      );
      void invalidateChatInbox(queryClient, viewerId);
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
      const result = await hideChat(viewerId, chat.id);
      if (!result.ok) {
        setError(result.error ?? "Chat o'chirilmadi");
        return;
      }
      await queryClient.cancelQueries({ queryKey: chatKeys.inbox(viewerId) });
      queryClient.setQueryData<ChatResponse[]>(chatKeys.inbox(viewerId), previous =>
        previous?.filter(item => item.id !== chat.id),
      );
      queryClient.removeQueries({ queryKey: chatKeys.messages(viewerId, chat.id) });
      void invalidateChatInbox(queryClient, viewerId);
      router.push('/chats');
    });
  }

  const images = messages.filter(message => message.attachmentType === 'IMAGE' && message.attachmentFileId);
  const imageIndex = images.findIndex(message => message.id === imageId);
  const image = images[imageIndex];
  const selectedMessage = messages.find(message => message.id === selectedId);

  return (
    <TradeProvider
      key={`${chat.id}:${clearedAt ?? ''}`}
      chat={{ ...chat, clearedAt }}
      viewerId={viewerId}
      listing={listing}
      initialPendingProposal={initialPendingProposal}
    >
      <div className="chat-conversation flex h-full min-h-0 w-full min-w-0 flex-col"
        style={viewport ? { '--chat-visible-height': `${viewport.height}px` } as React.CSSProperties : undefined}>
        <header className="relative z-10 flex shrink-0 items-center gap-2.5 border-b border-border/60 bg-card px-3 py-2 pt-[calc(var(--app-content-safe-top,0px)+0.5rem)] md:px-5 md:py-3">
          <Button asChild variant="ghost" size="sm" className="-ml-1 h-11 w-11 shrink-0 p-0 md:hidden">
            <Link href="/chats" aria-label="Chatlar ro'yxatiga qaytish">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <Link
            href={`/users/${encodeURIComponent(partnerId)}`}
            aria-label={`${name} profilini ko'rish`}
            title="Profilni ko'rish"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div
              className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-semibold uppercase',
                avatarTone(partnerId),
              )}
            >
              {partnerInitial(name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[15px] font-semibold text-foreground">{name}</p>
                {chat.important && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Muhim" />}
              </div>
              <ChatActivityStatus activity={activity} connected={connected} networkOnline={networkOnline} updating={messagesQuery.isFetching} />
            </div>
          </Link>
          <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 p-0" aria-label="Chatda qidirish" onClick={() => setSearchOpen(value => !value)}><Search className="h-5 w-5" /></Button>
          <ChatOptions important={chat.important} disabled={isUpdating} onToggleImportant={handleToggleImportant} onDelete={handleDelete} />
        </header>

        {searchOpen && <ChatSearch messages={messages} onJump={jumpToMessage} onClose={() => setSearchOpen(false)} loading={messagesQuery.isFetching}
          error={messagesQuery.isError ? 'Qidirish uchun barcha xabarlarni yuklab bo‘lmadi. Xabarlarni qayta yuklang.' : null} />}
        <TradePinnedBar />
        <TradeSyncStatus />
        <TradePanel />
        {messagesQuery.isError && (
          <div role="status" className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-1 text-xs text-destructive">
            <span className="min-w-0 flex-1">Xabarlarni yangilab bo‘lmadi. Qayta urinib ko‘ring.</span>
            <Button type="button" variant="ghost" className="min-h-11 shrink-0 px-2 text-xs" disabled={messagesQuery.isFetching} onClick={() => void messagesQuery.refetch()} aria-label="Xabarlarni qayta yuklash">
              {messagesQuery.isFetching ? 'Yuklanmoqda…' : 'Qayta urinish'}
            </Button>
          </div>
        )}

        <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          aria-label="Xabarlar"
          className="chat-message-list h-full overflow-y-auto overscroll-contain px-4 py-4 md:px-8 md:py-5"
        >
        {messages.length === 0 && outbox.entries.length === 0 && !messagesQuery.isError && (
          <div className="flex h-full min-h-24 items-center justify-center text-center">
            <div className="max-w-xs rounded-3xl bg-card/80 px-6 py-5 shadow-sm backdrop-blur-sm">
              <span className="chat-empty-icon mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full" aria-hidden="true">
                <MessageCircle className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-foreground">Suhbatni boshlang</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Salom bering yoki akkount haqida savol yozing.
              </p>
            </div>
          </div>
        )}
        {messages.map((message, index) => {
          const mine = message.senderId === viewerId;
          const hasAttachment = Boolean(message.attachmentType && message.attachmentFileId);
          const timeLabel = formatMessageTime(message.createdAt);
          const metadata = (
            <span className="chat-message-meta" data-overlay={hasAttachment && message.attachmentType === 'IMAGE' && !message.content}>
              {message.editedAt && <span>tahrirlangan</span>}
              <time dateTime={message.createdAt}>{timeLabel}</time>
              {mine && <MessageReadReceipt createdAt={message.createdAt} lastReadAt={partnerLastReadAt} />}
            </span>
          );
          const prev = index > 0 ? messages[index - 1] : null;
          const newDay = !prev || uzDayKey(prev.createdAt) !== uzDayKey(message.createdAt);
          const startsGroup = !canGroupMessages(messages[index - 1], message, firstUnreadId);
          const endsGroup = !canGroupMessages(message, messages[index + 1], firstUnreadId);
          return (
            <div key={message.id} data-message-id={message.id} data-highlighted={highlightedMessageId === message.id} className="chat-message-entry mx-auto max-w-3xl" data-new={!initialMessageIds.current.has(message.id)}>
              {newDay && (
                <div className="my-3 flex justify-center" role="separator">
                  <span className="chat-day-label rounded-full px-3 py-1 text-[11px] font-medium">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              {message.id === firstUnreadId && (
                <div className="my-4 flex justify-center" role="separator">
                  <span className="chat-unread-label rounded-full px-3 py-1 text-[11px] font-medium">
                    Yangi xabarlar
                  </span>
                </div>
              )}
              {message.messageType === 'TRADE_PROPOSAL' ? (
                <TradeProposalMessageCard
                  message={message}
                  viewerId={viewerId}
                  lastReadAt={partnerLastReadAt}
                />
              ) : (
                <div
                  className={cn('flex', mine ? 'justify-end' : 'justify-start', startsGroup ? 'mt-3' : 'mt-1')}
                >
                  <TouchMessageBubble
                    role="button"
                    tabIndex={0}
                    data-mine={mine}
                    data-group-start={startsGroup}
                    data-group-end={endsGroup}
                    aria-pressed={selectedId === message.id}
                    selectionMode={!!selectedId}
                    onReply={() => { startReply(message); composerRef.current?.focus(); }}
                    onActions={() => selectedId ? setSelectedId(message.id) : setActionTarget(message)}
                    className={cn(
                      'chat-message-bubble cursor-pointer text-left',
                      selectedId === message.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                      hasAttachment && message.attachmentType === 'IMAGE' ? 'p-1' : 'px-3 py-2',
                    )}
                  >
                    {message.replyToId && (
                      <button type="button" aria-label="Asl xabarga o‘tish" className="chat-message-reply mb-1.5 block w-full rounded-md border-l-[3px] px-2 py-1.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!jumpToMessage(message.replyToId!)) setError(messagesQuery.isFetching ? 'Xabarlar yuklanmoqda. Qayta urinib ko‘ring.' : 'Asl xabar o‘chirilgan yoki suhbat tarixida mavjud emas.');
                        }}>
                        <span className="block font-semibold">
                          {message.replySenderId === viewerId ? 'Siz' : name}
                        </span>
                        <span className="block truncate">
                          {chatPlainText(message.replyPreview ?? "") || "O'chirilgan xabar"}
                        </span>
                      </button>
                    )}
                    {hasAttachment && (
                      // Media controls (lightbox, play, download) must not open
                      // the message action sheet.
                      <span className="block" onClick={(e) => e.stopPropagation()}>
                        <MessageAttachment message={message} mine={mine} onOpenImage={() => setImageId(message.id)} />
                      </span>
                    )}
                    {message.content ? (
                      <span className="chat-message-text whitespace-pre-wrap break-words" data-caption={hasAttachment}>
                        {<ChatMessageContent content={message.content} packs={emojiCatalog.packs} />}
                        <span aria-hidden="true" className="chat-message-meta-space">
                          {message.editedAt && <span>tahrirlangan</span>}
                          <span>{timeLabel}</span>
                          {mine && <span className="chat-message-receipt-space" />}
                        </span>
                        {metadata}
                      </span>
                    ) : metadata}
                  </TouchMessageBubble>
                </div>
              )}
            </div>
          );
        })}
        <ChatOutbox packs={emojiCatalog.packs} entries={outbox.entries} onRetry={outbox.retry} onDismiss={outbox.dismiss} />
      </div>
      {hasNewMessages && (
        <Button variant="outline" className="absolute bottom-4 right-4 min-h-11 gap-2 rounded-full border-border/60 bg-card shadow-lg" onClick={scrollToBottom}>
          Yangi xabarlar <ArrowDown className="h-4 w-4" />
        </Button>
      )}
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{error}</span>
        </div>
      )}

      <div className={cn('px-3 pt-1 md:px-8 md:pb-4',
        emojiOpen ? 'flex min-h-0 shrink flex-col pb-0' : 'shrink-0 pb-[calc(var(--chat-safe-bottom,var(--app-content-safe-bottom,0px))+0.5rem)]')}>
        <div className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-col">
          {(replyTo || editing) && (
            <div className="mb-2 flex items-center gap-2 rounded-2xl bg-card px-3 py-2 shadow-sm">
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
                  {chatPlainText((editing ?? replyTo)?.content ?? "").trim() ||
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
            <div className="mb-2 flex items-center gap-2 rounded-2xl bg-card px-3 py-2 shadow-sm">
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
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <ChatTemplatePicker draft={savedDraft} disabled={Boolean(editing)||isRecording||isSending} onInsert={value=>{setSavedDraft(value);setTyping(Boolean(value.trim()));}} />
            <Link href={`/seller-tools?chatId=${encodeURIComponent(chat.id)}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">Shaxsiy qaydlar</Link>
          </div>
          <div className="flex shrink-0 items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              tabIndex={-1}
              className="hidden"
              onChange={(e) => {
                handlePickFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            {!isRecording && (
              <div className="flex min-w-0 flex-1 items-end rounded-[24px] bg-card p-0.5 shadow-sm">
                {!editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="h-11 w-11 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground [&_svg]:size-5"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSending}
                    title="Fayl biriktirish"
                    aria-label="Fayl biriktirish"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                )}
                <ChatRichComposer ref={composerRef} value={draft} packs={emojiCatalog.packs} readOnly={isSending} pickerOpen={emojiOpen}
                  onChange={(value) => { setDraft(value); setTyping(!editing && Boolean(value.trim())); }}
                  onSend={handleSend} onBlur={() => setTyping(false)}
                  onFocus={() => setEmojiOpen(false)} onPaste={handleComposerPaste}
                  placeholder={pendingFile ? 'Izoh (ixtiyoriy)…' : 'Xabar yozing…'}
                />
                <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground"
                  aria-label={emojiOpen ? 'Klaviaturani ochish' : 'Emoji tanlash'} aria-expanded={emojiOpen} disabled={isSending}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (emojiOpen) showKeyboard();
                    else { composerRef.current?.blur(); setEmojiOpen(true); }
                  }}>
                  {emojiOpen ? <Keyboard className="h-5 w-5" /> : <Smile className="h-5 w-5" />}
                </Button>
              </div>
            )}
            {draft.trim().length === 0 && !pendingFile && !editing && !replyTo ? (
              <VoiceRecorder
                disabled={isSending}
                onSend={handleSendVoice}
                onError={setError}
                recording={isRecording}
                onRecordingChange={(recording) => { setIsRecording(recording); if (recording) setEmojiOpen(false); }}
              />
            ) : (
              <Button
                type="button"
                size="lg"
                className="chat-send-button mb-0.5 h-11 w-11 shrink-0 rounded-full p-0 [&_svg]:size-5"
                onClick={handleSend}
                onPointerDown={(event) => event.preventDefault()}
                aria-label={editing ? 'Tahrirni saqlash' : 'Xabarni yuborish'}
                aria-busy={isSending}
                disabled={isSending || (!draft.trim() && !pendingFile)}
              >
                {isSending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : editing ? <Check /> : <Send className="ml-0.5" />}
              </Button>
            )}
          </div>
          {emojiOpen && !isRecording && <ChatEmojiPicker {...emojiCatalog} height={emojiHeight} disabled={isSending}
            onPick={insertEmoji} onClose={() => setEmojiOpen(false)} onBackspace={() => composerRef.current?.deleteBackward()} />}
          <p className="mt-1.5 hidden px-3 text-[10px] text-muted-foreground md:block">
            Enter — yuborish · Shift+Enter — yangi qator
          </p>
        </div>
      </div>

      {selectedMessage && <div role="toolbar" aria-label="Tanlangan xabar" className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-3 py-2 pb-[calc(var(--chat-safe-bottom,var(--app-content-safe-bottom,0px))+0.5rem)]">
        <span className="min-w-0 flex-1 truncate text-xs">1 ta xabar tanlandi</span>
        {selectedMessage.content.trim() && <Button variant="ghost" onClick={() => handleCopyMessage(selectedMessage)}>Nusxa olish</Button>}
        {selectedMessage.senderId === viewerId && <Button variant="ghost" disabled={isUpdating} onClick={() => handleDeleteMessage(selectedMessage)}>O&apos;chirish</Button>}
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Tanlashni bekor qilish" onClick={() => setSelectedId(null)}><X /></Button>
      </div>}
      {image && <MediaLightbox src={listingMediaUrl(image.attachmentFileId!)!} alt={image.attachmentName ?? 'Rasm'}
        onClose={() => setImageId(null)} currentIndex={imageIndex} totalCount={images.length}
        hasPrev={imageIndex > 0} hasNext={imageIndex < images.length - 1}
        onPrev={() => setImageId(images[imageIndex - 1].id)} onNext={() => setImageId(images[imageIndex + 1].id)} />}
      {actionTarget && (
        <MessageActionSheet
          message={actionTarget}
          mine={actionTarget.senderId === viewerId}
          onReply={() => startReply(actionTarget)}
          onCopy={() => handleCopyMessage(actionTarget)}
          onSelect={() => { setSelectedId(actionTarget.id); setActionTarget(null); }}
          onEdit={() => startEdit(actionTarget)}
          onDelete={() => handleDeleteMessage(actionTarget)}
          onClose={() => setActionTarget(null)}
        />
      )}
    </div>
  </TradeProvider>
  );
}

type SendResult =
  | { ok: true; message: MessageResponse }
  | { ok: false; error: string };

async function editMessage(viewerId: string, chatId: string, messageId: string, content: string): Promise<SendResult> {
  try { return { ok: true, message: await getChatSocket(viewerId).request('edit', chatId, { messageId, content }) }; }
  catch (error) { return { ok: false, error: socketError(error) }; }
}

async function deleteMessage(viewerId: string, chatId: string, messageId: string): Promise<HideResult> {
  try { await getChatSocket(viewerId).request('delete', chatId, { messageId }); return { ok: true }; }
  catch (error) { return { ok: false, error: socketError(error) }; }
}

function socketError(error: unknown) { return error instanceof Error ? error.message : "So‘rov bajarilmadi"; }

type ChatResult =
  | { ok: true; chat: ChatResponse }
  | { ok: false; error: string };

async function toggleImportant(viewerId: string, chatId: string): Promise<ChatResult> {
  try { return { ok: true, chat: await getChatSocket(viewerId).request('important', chatId) }; }
  catch (error) { return { ok: false, error: socketError(error) }; }
}

async function markChatRead(viewerId: string, chatId: string, messageId: string): Promise<boolean> {
  try { await getChatSocket(viewerId).request('read', chatId, { messageId }); return true; }
  catch { return false; }
}

type HideResult = { ok: true } | { ok: false; error: string };

async function hideChat(viewerId: string, chatId: string): Promise<HideResult> {
  try { await getChatSocket(viewerId).request('hide', chatId); return { ok: true }; }
  catch (error) { return { ok: false, error: socketError(error) }; }
}

function TradeSyncStatus() {
  const { loadError, refreshing, reload } = useTradeContext();
  if (!loadError) return null;
  return (
    <div role="status" className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-1 text-xs text-destructive">
      <span className="min-w-0 flex-1">{loadError}</span>
      <Button type="button" variant="ghost" className="min-h-11 shrink-0 px-2 text-xs" disabled={refreshing} onClick={() => void reload()} aria-label="Savdoni qayta yuklash">
        {refreshing ? 'Yuklanmoqda…' : 'Qayta urinish'}
      </Button>
    </div>
  );
}

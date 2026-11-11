'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ArrowUp, ShieldCheck, CheckCircle2, Clock, XCircle, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  type SupportChat,
  type SupportMessage,
  SUPPORT_CATEGORIES,
  getSupportChat,
  sendSupportMessage,
  closeSupportChat,
} from '@/lib/support';
import { cn } from '@/lib/utils';

interface SupportChatViewProps {
  initialChat: SupportChat;
  initialMessage?: string;
  onNewChatClick?: () => void;
  className?: string;
}

const POLL_INTERVAL_MS = 4000;

export function SupportChatView({
  initialChat,
  onNewChatClick,
  initialMessage = '',
  className = 'h-[520px] max-h-[75vh]',
}: SupportChatViewProps) {
  const [chat, setChat] = useState<SupportChat>(initialChat);
  const [messages, setMessages] = useState<SupportMessage[]>(initialChat.messages || []);
  const [draft, setDraft] = useState(initialMessage);
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSend] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  // Polling for replies from Telegram
  useEffect(() => {
    if (chat.status === 'CLOSED') return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const updated = await getSupportChat(chat.id);
        if (!cancelled && updated) {
          setChat(updated);
          setMessages(updated.messages || []);
        }
      } catch {
        // network glitch, ignore
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chat.id, chat.status]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;

    setError(null);
    startSend(async () => {
      try {
        const sent = await sendSupportMessage(chat.id, content);
        setMessages((prev) => [...prev, sent]);
        setDraft('');
        setChat((prev) => ({ ...prev, status: 'OPEN', lastMessageAt: sent.createdAt }));
      } catch (err: any) {
        setError(err.message || 'Xabar yuborilmadi');
      }
    });
  };

  const handleClose = async () => {
    if (!confirm('Ushbu murojaatni yakunlashni xohlaysizmi?')) return;
    try {
      const closed = await closeSupportChat(chat.id);
      setChat(closed);
    } catch (err: any) {
      setError(err.message || 'Murojaatni yopib bo‘lmadi');
    }
  };

  const categoryDef = SUPPORT_CATEGORIES[chat.category] || SUPPORT_CATEGORIES.SUPPORT;

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            {categoryDef.badge}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              chat.status === 'OPEN' && 'bg-warning-soft text-warning',
              chat.status === 'REPLIED' && 'bg-success-soft text-success',
              chat.status === 'CLOSED' && 'bg-muted text-muted-foreground'
            )}
          >
            {chat.status === 'OPEN' && (
              <>
                <Clock className="h-3 w-3 animate-spin" /> Kutilmoqda
              </>
            )}
            {chat.status === 'REPLIED' && (
              <>
                <CheckCircle2 className="h-3 w-3" /> Javob berildi
              </>
            )}
            {chat.status === 'CLOSED' && (
              <>
                <XCircle className="h-3 w-3" /> Yopilgan
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {chat.status !== 'CLOSED' && (
            <button
              type="button"
              onClick={handleClose}
              className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 transition"
            >
              Yakunlash
            </button>
          )}
          {onNewChatClick && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNewChatClick}
              className="gap-1 text-xs h-7 px-2"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Yangi murojaat
            </Button>
          )}
        </div>
      </div>

      {/* Messages thread */}
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {messages.map((m) => {
          const isUser = m.senderType === 'USER';
          const time = formatTime(m.createdAt);

          return (
            <div
              key={m.id}
              className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1">
                {!isUser && (
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-primary">
                    <ShieldCheck className="h-3 w-3" /> {m.senderName || 'Admin'}
                  </span>
                )}
                {isUser && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {m.senderName || 'Siz'}
                  </span>
                )}
              </div>

              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm',
                  isUser
                    ? 'bg-primary text-primary-foreground rounded-br-none'
                    : 'bg-muted/80 text-foreground border border-border/60 rounded-bl-none'
                )}
              >
                {m.content}
                <div
                  className={cn(
                    'mt-1 text-[10px] font-mono text-right',
                    isUser ? 'text-primary-foreground/75' : 'text-muted-foreground'
                  )}
                >
                  {time}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer / Composer */}
      <div className="pt-3 border-t border-border mt-2 shrink-0">
        {chat.status === 'CLOSED' ? (
          <div className="rounded-xl bg-muted/60 p-3 text-center text-xs text-muted-foreground">
            Ushbu murojaat yakunlangan. Yangi savolingiz bo‘lsa, yangi murojaat ochishingiz mumkin.
            {onNewChatClick && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNewChatClick}
                className="mt-2 w-full gap-1.5"
              >
                <PlusCircle className="h-4 w-4" />
                Yangi murojaat ochish
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-2">
            {error && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {error}
              </p>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-background py-1.5 pl-3.5 pr-1.5 shadow-sm transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
              <textarea
                rows={1}
                aria-label="Javob"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Javob yozing…"
                className="block max-h-32 min-h-[32px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none [field-sizing:content]"
              />
              <button
                type="submit"
                disabled={isSending || !draft.trim()}
                aria-label="Yuborish"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

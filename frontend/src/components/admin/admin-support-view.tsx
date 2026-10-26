'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, useEffect, useRef } from 'react';
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Handshake,
  Headphones,
  HelpCircle,
  Inbox,
  Loader2,
  MessageSquare,
  Search,
  Send,
  User,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  adminCloseSupportChat,
  adminGetSupportChat,
  adminReplySupportChat,
} from '@/lib/marketplace-actions';
import { formatListingDate } from '@/lib/marketplace-format';
import type { AdminSupportChatSummary } from '@/lib/marketplace-types';
import {
  SUPPORT_CATEGORIES,
  type SupportCategory,
  type SupportChat,
  type SupportChatStatus,
} from '@/lib/support';
import { cn } from '@/lib/utils';

interface AdminSupportViewProps {
  chats: AdminSupportChatSummary[];
  activeStatus?: SupportChatStatus;
  activeCategory?: SupportCategory;
  activeSearch?: string;
}

const STATUS_FILTERS: Array<{ value: SupportChatStatus | 'all'; label: string }> = [
  { value: 'OPEN', label: 'Kutilmoqda' },
  { value: 'REPLIED', label: 'Javob berilgan' },
  { value: 'CLOSED', label: 'Yopilgan' },
  { value: 'all', label: 'Barchasi' },
];

const CATEGORY_FILTERS: Array<{ value: SupportCategory | 'all'; label: string }> = [
  { value: 'all', label: 'Barcha mavzular' },
  { value: 'SUPPORT', label: '🛠 Texnik yordam' },
  { value: 'PARTNERSHIP', label: '🤝 Hamkorlik' },
  { value: 'QUESTION', label: '❓ Umumiy savol' },
];

const STATUS_BADGES: Record<SupportChatStatus, { label: string; className: string }> = {
  OPEN: { label: 'Kutilmoqda', className: 'bg-warning-soft text-warning border-warning-border' },
  REPLIED: { label: 'Javob berilgan', className: 'bg-success-soft text-success border-success-border' },
  CLOSED: { label: 'Yopilgan', className: 'bg-muted text-muted-foreground border-border' },
};

export function AdminSupportView({
  chats,
  activeStatus,
  activeCategory,
  activeSearch = '',
}: AdminSupportViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Search input state
  const [searchInput, setSearchInput] = useState(activeSearch);

  // Selected chat modal/drawer
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatDetails, setChatDetails] = useState<SupportChat | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load chat details when selectedChatId changes
  useEffect(() => {
    if (!selectedChatId) {
      setChatDetails(null);
      setReplyText('');
      setActionError(null);
      return;
    }

    let isMounted = true;
    setLoadingChat(true);
    setActionError(null);

    adminGetSupportChat(selectedChatId).then((res) => {
      if (!isMounted) return;
      setLoadingChat(false);
      if (res.ok) {
        setChatDetails(res.data);
      } else {
        setActionError(res.message || 'Murojaat yuklanmadi');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedChatId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (chatDetails?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatDetails?.messages]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (activeStatus) params.set('status', activeStatus);
    if (activeCategory) params.set('category', activeCategory);
    if (searchInput.trim()) params.set('search', searchInput.trim());
    router.push(`/admin/support?${params.toString()}`);
  }

  function handleSendReply() {
    if (!selectedChatId || !replyText.trim() || submittingReply) return;

    setSubmittingReply(true);
    setActionError(null);

    adminReplySupportChat(selectedChatId, replyText.trim()).then((res) => {
      setSubmittingReply(false);
      if (!res.ok) {
        setActionError(res.message || 'Javob yuborilmadi');
        return;
      }

      setReplyText('');
      // Reload chat details and refresh background list
      adminGetSupportChat(selectedChatId).then((chatRes) => {
        if (chatRes.ok) setChatDetails(chatRes.data);
      });
      startTransition(() => {
        router.refresh();
      });
    });
  }

  function handleCloseChat() {
    if (!selectedChatId || submittingReply) return;

    setSubmittingReply(true);
    setActionError(null);

    adminCloseSupportChat(selectedChatId).then((res) => {
      setSubmittingReply(false);
      if (!res.ok) {
        setActionError(res.message || 'Murojaat yopilmadi');
        return;
      }

      // Reload chat details and refresh list
      adminGetSupportChat(selectedChatId).then((chatRes) => {
        if (chatRes.ok) setChatDetails(chatRes.data);
      });
      startTransition(() => {
        router.refresh();
      });
    });
  }

  function buildFilterHref(status?: SupportChatStatus | 'all', category?: SupportCategory | 'all') {
    const params = new URLSearchParams();
    const st = status !== undefined ? (status === 'all' ? undefined : status) : activeStatus;
    const cat = category !== undefined ? (category === 'all' ? undefined : category) : activeCategory;

    if (st) params.set('status', st);
    if (cat) params.set('category', cat);
    if (activeSearch) params.set('search', activeSearch);

    const qs = params.toString();
    return `/admin/support${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="space-y-6">
      {/* Header & title */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Headphones className="h-6 w-6 text-primary" />
            Murojaatlar va Yordam chati
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saytdagi foydalanuvchilar va mehmonlar murojaatlari, hamkorlik takliflari hamda savollari.
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-72">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Ism yoki kontakt..."
              className="w-full rounded-lg border border-border bg-card pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Qidirish
          </Button>
        </form>
      </div>

      {/* Filters: Status and Category */}
      <div className="space-y-3">
        {/* Status navigation */}
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Status bo‘yicha filtr">
          {STATUS_FILTERS.map((f) => {
            const isActive = f.value === 'all' ? activeStatus === undefined : f.value === activeStatus;
            return (
              <Link
                key={f.value}
                href={buildFilterHref(f.value, undefined)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold transition',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>

        {/* Category pills */}
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Kategoriya bo‘yicha filtr">
          {CATEGORY_FILTERS.map((c) => {
            const isActive = c.value === 'all' ? activeCategory === undefined : c.value === activeCategory;
            return (
              <Link
                key={c.value}
                href={buildFilterHref(undefined, c.value)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  isActive
                    ? 'bg-secondary text-secondary-foreground font-semibold ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main chat list */}
      {chats.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Inbox className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-3 text-base font-semibold text-foreground">Murojaatlar topilmadi</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeSearch || activeStatus || activeCategory
              ? 'Tanlangan filtrlar bo‘yicha hech qanday murojaat mavjud emas.'
              : 'Hozircha yangi murojaatlar yo‘q.'}
          </p>
          {(activeSearch || activeStatus || activeCategory) && (
            <div className="mt-4">
              <Link href="/admin/support">
                <Button variant="outline" size="sm">
                  Filtrlarni tozalash
                </Button>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {chats.map((item) => {
            const catInfo = SUPPORT_CATEGORIES[item.category] || {
              label: item.category,
              badge: '💬 Chat',
            };
            const statusInfo = STATUS_BADGES[item.status] || {
              label: item.status,
              className: 'bg-muted text-muted-foreground',
            };

            return (
              <div
                key={item.id}
                className={cn(
                  'group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm',
                  item.status === 'OPEN' && 'border-warning-border bg-warning-soft',
                )}
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                      {catInfo.badge}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        statusInfo.className,
                      )}
                    >
                      {statusInfo.label}
                    </span>

                    {item.telegramRootMessageId && (
                      <span className="inline-flex items-center gap-1 rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">
                        TG #{item.telegramRootMessageId}
                      </span>
                    )}

                    <span className="text-xs text-muted-foreground ml-auto sm:ml-0">
                      {formatListingDate(item.lastMessageAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {item.senderName}
                    </span>
                    {item.senderContact && (
                      <span className="text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded font-mono">
                        {item.senderContact}
                      </span>
                    )}
                    {item.guestSessionId && (
                      <span className="text-[10px] text-muted-foreground/80 uppercase font-mono">
                        (mehmon)
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 italic">
                    &ldquo;{item.lastMessagePreview || 'Xabar matni yo‘q'}&rdquo;
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    size="sm"
                    variant={item.status === 'OPEN' ? 'default' : 'outline'}
                    onClick={() => setSelectedChatId(item.id)}
                    className="gap-1.5"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Yozishmani ko‘rish
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chat Conversation Drawer / Modal */}
      {selectedChatId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in-0">
          <div className="relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border p-4 bg-muted/30">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {chatDetails?.senderName || 'Murojaat'}
                  </span>
                  {chatDetails?.status && (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                        STATUS_BADGES[chatDetails.status]?.className,
                      )}
                    >
                      {STATUS_BADGES[chatDetails.status]?.label}
                    </span>
                  )}
                </div>
                {chatDetails?.senderContact && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    Bog‘lanish: {chatDetails.senderContact}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {chatDetails && chatDetails.status !== 'CLOSED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCloseChat}
                    disabled={submittingReply}
                    className="text-xs h-8 text-warning hover:bg-warning-soft"
                  >
                    Murojaatni yopish
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedChatId(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  aria-label="Yopish"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Error banner */}
            {actionError && (
              <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-xs text-destructive flex items-center justify-between">
                <span>{actionError}</span>
                <button onClick={() => setActionError(null)} className="font-bold">×</button>
              </div>
            )}

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[250px] max-h-[55vh] bg-background/50">
              {loadingChat ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs">Yozishmalar yuklanmoqda...</span>
                </div>
              ) : chatDetails?.messages?.length ? (
                chatDetails.messages.map((m) => {
                  const isAdmin = m.senderType === 'ADMIN';
                  return (
                    <div
                      key={m.id}
                      className={cn('flex flex-col max-w-[85%]', isAdmin ? 'ml-auto items-end' : 'mr-auto items-start')}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {m.senderName}
                        </span>
                        {isAdmin && (
                          <span className="text-[9px] bg-primary/15 text-primary px-1 py-0.2 rounded font-semibold uppercase">
                            Admin
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/60">
                          {formatListingDate(m.createdAt)}
                        </span>
                      </div>

                      <div
                        className={cn(
                          'rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words leading-relaxed shadow-sm',
                          isAdmin
                            ? 'bg-primary text-primary-foreground rounded-br-xs'
                            : 'bg-muted text-foreground rounded-bl-xs border border-border/50',
                        )}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Xabarlar mavjud emas
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Modal Footer: Reply input */}
            <div className="border-t border-border p-3 bg-muted/20">
              {chatDetails?.status === 'CLOSED' ? (
                <div className="py-2 text-center text-xs text-muted-foreground bg-muted/40 rounded-lg">
                  Bu murojaat yopilgan. Foydalanuvchi yangi xabar yozmaguncha unga javob berib bo‘lmaydi.
                </div>
              ) : (
                <div className="flex gap-2 items-end">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder="Admin sifatida javob yozing... (Enter jo‘natish)"
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-border bg-card p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || submittingReply}
                    className="h-10 px-4 gap-1.5"
                  >
                    {submittingReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span className="hidden sm:inline">Yuborish</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

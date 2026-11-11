'use client';

import { useEffect, useState } from 'react';
import { MessageCircleQuestion, X, Headphones } from 'lucide-react';
import { SupportNewChatForm } from './support-new-chat-form';
import { SupportChatView } from './support-chat-view';
import {
  type SupportCategory,
  type SupportChat,
  getActiveSupportChat,
} from '@/lib/support';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SupportWidgetProps {
  user: User | null;
}

export function SupportWidget({ user }: SupportWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeChat, setActiveChat] = useState<SupportChat | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [initialCategory, setInitialCategory] = useState<SupportCategory>('SUPPORT');
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnreadReply, setHasUnreadReply] = useState(false);

  // Load active chat when opened or on mount
  useEffect(() => {
    let cancelled = false;
    getActiveSupportChat()
      .then((chat) => {
        if (!cancelled && chat) {
          setActiveChat(chat);
          if (chat.status === 'REPLIED') {
            setHasUnreadReply(true);
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for custom global event to open support chat from any link/button
  useEffect(() => {
    const handleOpen = (e: CustomEvent<{ category?: SupportCategory }>) => {
      if (e.detail?.category) {
        setInitialCategory(e.detail.category);
        setIsCreatingNew(true);
      }
      setIsOpen(true);
      setHasUnreadReply(false);
    };

    window.addEventListener('open-support-chat' as any, handleOpen);
    return () => {
      window.removeEventListener('open-support-chat' as any, handleOpen);
    };
  }, []);

  const showChat = !isLoading && activeChat !== null && !isCreatingNew;

  const handleOpenWidget = async () => {
    setIsOpen(true);
    setHasUnreadReply(false);
    setIsLoading(true);
    try {
      const chat = await getActiveSupportChat();
      setActiveChat(chat);
      if (!chat) {
        setIsCreatingNew(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <div className="fixed right-4 bottom-[calc(var(--marketplace-bottom-bar-height,4.5rem)+1rem)] z-40 sm:right-6 md:bottom-6">
          <button
            type="button"
            onClick={handleOpenWidget}
            aria-label="Qo‘llab-quvvatlash chati"
            className="group relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl border-2 border-background ring-1 ring-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-primary/30 active:scale-95"
          >
            <Headphones className="h-5 w-5 sm:h-6 sm:w-6 transition-transform group-hover:scale-110" />
            {hasUnreadReply && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-success border-2 border-background" />
              </span>
            )}
          </button>
        </div>
      )}

      {/* Floating Chat Modal / Panel */}
      {isOpen && (
        <div
          data-interruption-open="support"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-end justify-center sm:justify-end p-0 sm:p-6 bg-black/40 sm:bg-transparent pointer-events-auto"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Qo‘llab-quvvatlash"
            className={cn(
              'w-full sm:w-[380px] bg-card border border-border shadow-2xl overflow-hidden flex flex-col',
              'rounded-t-2xl sm:rounded-2xl max-h-[85vh] animate-in fade-in slide-in-from-bottom-3 duration-150',
              showChat ? 'h-[80vh] sm:h-[540px]' : 'h-auto'
            )}
          >
            {/* Header */}
            <div className="flex h-11 items-center justify-between pl-4 pr-1.5 border-b border-border/70 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Headphones className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <h2 className="truncate text-sm font-semibold text-foreground">
                  Qo‘llab-quvvatlash
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Yopish"
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className={cn('p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4', showChat ? 'flex-1 min-h-0 flex flex-col' : 'overflow-y-auto')}>
              {isLoading ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  Yuklanmoqda...
                </div>
              ) : showChat ? (
                <SupportChatView
                  initialChat={activeChat!}
                  className="flex-1 min-h-0"
                  onNewChatClick={() => setIsCreatingNew(true)}
                />
              ) : (
                <SupportNewChatForm
                  user={user}
                  initialCategory={initialCategory}
                  onChatCreated={(newChat) => {
                    setActiveChat(newChat);
                    setIsCreatingNew(false);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Helper to programmatically open the support chat widget from anywhere */
export function openSupportChat(category?: SupportCategory) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('open-support-chat', { detail: { category } })
  );
}

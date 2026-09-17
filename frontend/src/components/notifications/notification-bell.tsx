'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, MessageCircle } from 'lucide-react';

import { NOTIFICATIONS_CHANGED } from '@/lib/firebase-push';
import { Button } from '@/components/ui/button';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
  notificationLabel,
} from '@/lib/notifications-client';
import { formatListingDate } from '@/lib/marketplace-format';
import type { NotificationResponse } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 30_000;

interface NotificationBellProps {
  className?: string;
  /**
   * Horizontal anchor of the dropdown relative to the bell on md+ screens.
   * 'right' (default) — right edges align; suits bells near the viewport's
   * right edge (marketplace top bar). 'left' — left edges align, opening
   * rightward; suits the 320px chats pane where a right-anchored panel would
   * spill past the pane's left edge. Mobile always right-anchors (viewport-
   * clamped by max-w).
   */
  dropdownAlign?: 'left' | 'right';
}

/**
 * Bell + unread badge + dropdown. Polls the unread count; loads the list
 * lazily when opened. Clicking an item marks it read and jumps to the chat.
 */
export function NotificationBell({ className, dropdownAlign = 'right' }: NotificationBellProps) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationResponse[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    const count = await fetchUnreadCount();
    if (count !== null) setUnread(count);
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = window.setInterval(refreshCount, POLL_INTERVAL_MS);
    const refresh = () => {
      void refreshCount();
      if (open) void fetchNotifications().then(setItems);
    };
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refreshCount, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  async function toggleOpen() {
    if (window.matchMedia('(max-width: 639px)').matches) {
      router.push('/notifications');
      return;
    }
    const next = !open;
    setOpen(next);
    if (next) {
      setItems(await fetchNotifications());
    }
  }

  async function handleItemClick(n: NotificationResponse) {
    setOpen(false);
    if (!n.readAt) {
      setUnread((v) => Math.max(0, v - 1));
      await markNotificationRead(n.id);
    }
    const href = notificationHref(n);
    if (href) router.push(href);
  }

  async function handleReadAll() {
    setUnread(0);
    setItems((prev) =>
      prev?.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) ?? prev,
    );
    await markAllNotificationsRead();
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  }

  return (
    <div ref={rootRef} className={cn('relative', open && 'z-50', className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 w-11 rounded-full bg-primary/10 p-0 text-primary sm:h-9 sm:w-9 sm:bg-transparent sm:text-foreground"
        aria-expanded={open}
        onClick={toggleOpen}
        aria-label={unread > 0 ? `Bildirishnomalar (${unread} o'qilmagan)` : 'Bildirishnomalar'}
      >
        <span className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9.5px] font-bold leading-4 text-destructive-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </span>
      </Button>

      {open && (
        <div
          className={cn(
            'absolute top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-card-hover',
            dropdownAlign === 'left' ? 'right-0 md:left-0 md:right-auto' : 'right-0',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-black uppercase tracking-wider text-foreground">
              Bildirishnomalar
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleReadAll}
                className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Barchasini o'qish
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Yuklanmoqda…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Hozircha bildirishnomalar yo'q.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={cn(
                    'flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-accent/60',
                    !n.readAt && 'bg-accent/30',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full',
                      n.readAt
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-primary/15 text-primary',
                    )}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-xs text-foreground',
                        !n.readAt && 'font-bold',
                      )}
                    >
                      {notificationLabel(n)}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                      {formatListingDate(n.createdAt)}
                    </span>
                  </span>
                  {!n.readAt && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

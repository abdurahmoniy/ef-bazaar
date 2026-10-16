'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BellOff,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
  notificationLabel,
} from '@/lib/notifications-client';
import { formatListingDate } from '@/lib/marketplace-format';
import type { NotificationResponse } from '@/lib/marketplace-types';
import { NOTIFICATIONS_CHANGED } from '@/lib/firebase-push';
import { PushSettings } from './push-settings';
import { cn } from '@/lib/utils';

interface NotificationsViewProps {
  initialItems?: NotificationResponse[];
}

export function NotificationsView({ initialItems }: NotificationsViewProps) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationResponse[] | null>(initialItems ?? null);
  const [loading, setLoading] = useState(!initialItems);

  const loadNotifications = useCallback(async () => {
    if (!initialItems) setLoading(true);
    const data = await fetchNotifications(50);
    setItems(data);
    setLoading(false);
  }, [initialItems]);

  useEffect(() => {
    void loadNotifications();
    const refresh = () => { void loadNotifications(); };
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [loadNotifications]);

  const handleItemClick = async (n: NotificationResponse) => {
    if (!n.readAt) {
      await markNotificationRead(n.id);
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      setItems((prev) =>
        prev?.map((item) =>
          item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item,
        ) ?? prev,
      );
    }
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  const handleReadAll = async () => {
    await markAllNotificationsRead();
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    setItems((prev) =>
      prev?.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })) ?? prev,
    );
  };

  const unreadCount = items?.filter((n) => !n.readAt).length ?? 0;

  const getActionDetails = (n: NotificationResponse) => {
    switch (n.type) {
      case 'CHAT_CREATED':
        return {
          action: "E'loningiz bo'yicha yangi chat ochildi",
          icon: <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
          bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
        };
      case 'TRADE_EMAIL_CHANGE_CODE':
      case 'TRADE_LOGIN_CODE':
        return { action: notificationLabel(n), icon: <ShieldCheck className="h-5 w-5 text-primary" />, bg: 'bg-primary/10' };
      case 'TRADE_ADMIN_INVITED':
        return {
          action: 'Xavfsiz bitim moderatsiyasiga taklif',
          icon: <ShieldCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
          bg: 'bg-amber-500/10 dark:bg-amber-400/10',
        };
      case 'TRADE_MAILBOX_RECEIVED':
        return {
          action: 'Qo\u2018lga kiritilgan akkount emaili sizniki',
          icon: <Mail className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
          bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
        };
      case 'TRADE_MAILBOX_RETURNED':
        return {
          action: 'Savdo yakunlanmadi \u2014 email sizga biriktirildi',
          icon: <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
          bg: 'bg-amber-500/10 dark:bg-amber-400/10',
        };
      case 'CUSTOM_MAILBOX_FREED':
        return {
          action: 'Custom emailingiz bo\u2018shadi \u2014 boshqa akkountingizga ulang',
          icon: <Mail className="h-5 w-5 text-gold-foreground" />,
          bg: 'bg-gold-soft',
        };
      case 'CHAT_MESSAGE':
      default:
        return {
          action: 'Sizga yangi xabar yubordi',
          icon: <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
          bg: 'bg-blue-500/10 dark:bg-blue-400/10',
        };
    }
  };

  return (
    <div className="space-y-3 pb-24 min-h-[calc(100dvh-8rem)] flex flex-col">
      {/* Mobile App Sticky Top Header - Identical to E'lonlarim */}
      <div className="-mx-4 -mt-4 sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/95 px-4 pb-3 pt-[calc(0.75rem+var(--app-content-safe-top))] backdrop-blur-md sm:pt-3 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border sm:px-5 sm:shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/marketplace"
            aria-label="Bozorga qaytish"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted/60 text-foreground transition hover:bg-muted active:scale-90"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-base font-bold text-foreground leading-none">Bildirishnomalar</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {loading
                ? 'Yuklanmoqda…'
                : unreadCount > 0
                ? `${unreadCount} ta o'qilmagan`
                : "Barcha xabarlar o'qilgan"}
            </p>
          </div>
        </div>

        {!loading && unreadCount > 0 && (
          <button
            type="button"
            onClick={handleReadAll}
            title="Barchasini o'qilgan deb belgilash"
            aria-label="Barchasini o'qilgan deb belgilash"
            className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/20 active:scale-90"
          >
            <CheckCheck className="h-5 w-5" />
          </button>
        )}
      </div>

      <PushSettings />

      {/* Main Content Area - Full screen width matching E'lonlarim */}
      {loading ? (
        <div className="-mx-4 divide-y divide-border/40 bg-card border-b border-border/40 sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm sm:overflow-hidden animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-muted/60" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="h-3.5 w-28 rounded bg-muted/60" />
                  <div className="h-3 w-12 rounded bg-muted/40" />
                </div>
                <div className="h-3 w-44 rounded bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card px-4 py-16 text-center shadow-xs min-h-[50vh] flex flex-col items-center justify-center">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-muted/50 text-muted-foreground ring-1 ring-border/50">
            <BellOff className="h-8 w-8 opacity-60" />
          </div>
          <h2 className="mt-3 text-base font-bold text-foreground">Bildirishnomalar yo'q</h2>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs leading-relaxed">
            Savdolar, yangi chatlar va tizim xabarlari shu yerda ko'rinadi.
          </p>
        </div>
      ) : (
        <div className="-mx-4 divide-y divide-border/40 bg-card border-b border-border/40 sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm sm:overflow-hidden">
          {items.map((n) => {
            const { action, icon, bg } = getActionDetails(n);
            const isUnread = !n.readAt;
            const actorName = n.actorDisplayName?.trim() || 'Foydalanuvchi';

            return (
              <button
                key={n.id}
                type="button"
                onClick={() => handleItemClick(n)}
                className={cn(
                  'flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 active:bg-muted/70 tap-press',
                  isUnread && 'bg-primary/[0.03] dark:bg-primary/[0.06]',
                )}
              >
                {/* Notification type icon */}
                <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', bg)}>
                  {icon}
                </div>

                {/* Content info */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        'text-[14px] truncate',
                        isUnread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90',
                      )}
                    >
                      {actorName}
                    </p>
                    <span className="text-[11px] font-medium text-muted-foreground shrink-0">
                      {formatListingDate(n.createdAt)}
                    </span>
                  </div>

                  <p className="text-[12.5px] text-muted-foreground truncate leading-snug">
                    {action}
                  </p>
                </div>

                {/* Status indicator */}
                <div className="shrink-0 ml-1">
                  {isUnread ? (
                    <span
                      title="O'qilmagan"
                      className="block h-2 w-2 rounded-full bg-primary ring-4 ring-primary/20"
                    />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, Users, XCircle } from 'lucide-react';

import { TelegramPreview } from '@/components/admin/telegram-preview';
import {
  fetchBroadcastHistory,
  isActive,
  type Broadcast,
  type BroadcastAudience,
  type BroadcastStatus,
} from '@/lib/bot-broadcast';
import { listingMediaUrl } from '@/lib/marketplace-media';

const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  ALL: 'Hammaga',
  USERS: 'Faqat userlarga',
  ADMINS: 'Faqat adminlarga',
  SELECTED: 'Tanlanganlarga',
};

function StatusBadge({ status }: { status: BroadcastStatus }) {
  const map: Record<BroadcastStatus, { icon: React.ReactNode; label: string; className: string }> = {
    QUEUED: {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: 'Navbatda',
      className: 'bg-muted text-muted-foreground',
    },
    SENDING: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: 'Yuborilmoqda',
      className: 'bg-primary/15 text-primary',
    },
    SENT: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: 'Yuborildi',
      className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
    FAILED: {
      icon: <XCircle className="h-3.5 w-3.5" />,
      label: 'Uzildi',
      className: 'bg-destructive/15 text-destructive',
    },
  };
  const item = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${item.className}`}
    >
      {item.icon}
      {item.label}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BroadcastHistory() {
  const [items, setItems] = useState<Broadcast[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const page = await fetchBroadcastHistory(0);
        if (!cancelled) setItems(page.content);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Tarix yuklanmadi');
      }
    }
    load();

    // Ketayotgan jo'natma bo'lsa sonlar o'zgarib turadi — sahifani qo'lda
    // yangilamaslik uchun davriy so'raymiz. Hammasi tugagach to'xtaydi.
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Yuklanmoqda…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Hali birorta ommaviy xabar yuborilmagan.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article key={item.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge status={item.status} />
            <time className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</time>
          </div>

          <TelegramPreview
            html={item.messageText}
            bannerUrl={item.bannerFileId ? listingMediaUrl(item.bannerFileId) : null}
            buttons={item.buttons}
          />

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {AUDIENCE_LABEL[item.audience]} · {item.totalRecipients} manzil
            </div>

            {/*
              Uch xil natija alohida. "Yetmadi" degan bitta son bloklagan
              foydalanuvchini — bu kutilgan holat — haqiqiy nosozlik bilan
              qorishtirib yuborardi.
            */}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-emerald-600 dark:text-emerald-400">
                Yetdi: {item.sentCount}
              </span>
              <span className="text-muted-foreground">Bloklagan: {item.blockedCount}</span>
              {item.failedCount > 0 && (
                <span className="text-destructive">Xato: {item.failedCount}</span>
              )}
            </div>

            {isActive(item.status) && item.totalRecipients > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.round(
                      ((item.sentCount + item.blockedCount + item.failedCount) /
                        item.totalRecipients) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            )}

            {item.errorMessage && (
              <p className="text-destructive">{item.errorMessage}</p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

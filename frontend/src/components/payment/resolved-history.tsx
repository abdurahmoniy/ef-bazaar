'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, History, Loader2, UserCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { listResolvedObservations } from '@/lib/payment-admin-client';
import type { ObservationResponse } from '@/lib/payment-types';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { userLabel, type FoundUser } from '@/lib/user-search';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Ismlarni bitta so'rovda yechadi.
 *
 * <p>Har qator uchun alohida so'rov yuborish yuz qatorli ro'yxatda yuzta
 * so'rov degani. Noma'lum id lar javobdan tushib qoladi — ular ekranda
 * UUID bo'lib qolaveradi, bu xato emas: o'chirilgan foydalanuvchi ham
 * tarixda qolishi kerak.
 */
async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const params = new URLSearchParams({ ids: unique.join(',') });
  const response = await fetch(`/api/auth/v1/admin/users/by-ids?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) return new Map();

  const users = (await response.json()) as FoundUser[];
  return new Map(users.map((user) => [user.id, userLabel(user)]));
}

/**
 * Qo'lda hal qilingan tushumlar tarixi.
 *
 * <p>Biriktirishni qaytarib bo'lmaydi — pul darhol hisobga tushadi va
 * qator boshqa hech qachon hal qilinmaydi. Shuning uchun kim, kimga,
 * qachon va nima uchun degan to'rttasi ham bir joyda turishi kerak.
 */
export function ResolvedHistory() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ObservationResponse[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || items !== null) return;

    let cancelled = false;
    (async () => {
      try {
        const found = await listResolvedObservations();
        if (cancelled) return;
        setItems(found);
        const resolved = await resolveNames(
          found.flatMap((o) => [o.resolvedBy, o.resolvedUserId].filter(Boolean) as string[]),
        );
        if (!cancelled) setNames(resolved);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Tarix yuklanmadi');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, items]);

  const nameOf = (id?: string | null) => (id ? (names.get(id) ?? id) : '—');

  return (
    <section className="space-y-3">
      <Button variant="outline" onClick={() => setOpen((v) => !v)} className="gap-2">
        <History className="h-4 w-4" />
        {open ? 'Tarixni yashirish' : 'Hal qilinganlar tarixi'}
      </Button>

      {open && error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {open && items === null && !error && (
        <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
        </div>
      )}

      {open && items?.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Hali qo&apos;lda hal qilingan tushum yo&apos;q.
        </p>
      )}

      {open && items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="space-y-1.5 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{formatPriceUZS(item.amountTiyin / 100)}</span>
                <span className="text-xs text-muted-foreground">
                  &bull;&bull;&bull;&bull; {item.cardLast4} ·{' '}
                  {item.resolvedAt ? formatDate(item.resolvedAt) : '—'}
                </span>
              </div>

              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Kimga:</span>
                <span className="font-medium">{nameOf(item.resolvedUserId)}</span>
              </p>

              <p className="text-xs text-muted-foreground">
                Biriktirdi: <span className="font-medium">{nameOf(item.resolvedBy)}</span>
                {item.status === 'IGNORED' && ' · e’tiborsiz qoldirilgan'}
              </p>

              {item.resolutionNote && (
                <p className="rounded-md bg-muted/50 p-2 text-xs">{item.resolutionNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

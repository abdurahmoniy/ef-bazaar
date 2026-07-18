'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { AlertTriangle, CreditCard, Loader2, Plus, Trash2 } from 'lucide-react';

import { CardAddModal } from '@/components/profile/card-add-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CardBrand, CardResponse } from '@/lib/trade-types';
import { cn } from '@/lib/utils';

interface ProfileCardsProps {
  cards: CardResponse[];
}

/**
 * Client component for the profile "Kartalar" tab. Renders the saved-card
 * list (or an empty state), a "Karta qo'shish" launcher for the modal, and
 * a two-step delete on each row (first click arms the confirm, second
 * click sends `DELETE /api/trade/v1/cards/{id}`).
 *
 * State refresh strategy: after add/delete the modal + row use
 * `router.refresh()` so the SSR fetch in `profile/page.tsx` re-runs and
 * pushes fresh data down as props.
 */
export function ProfileCards({ cards }: ProfileCardsProps) {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleAdded = useCallback(() => {
    setShowAddModal(false);
  }, []);

  if (cards.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card">
          <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <h2 className="mt-2 text-sm font-bold text-foreground">
            Saqlangan kartangiz yo&apos;q
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Savdo boshlash uchun kamida bitta karta qo&apos;shing. Kartalar
            xavfsiz shifrlangan holda saqlanadi.
          </p>
          <Button size="sm" className="mt-3" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" /> Karta qo&apos;shish
          </Button>
        </div>
        {showAddModal && (
          <CardAddModal onClose={() => setShowAddModal(false)} onAdded={handleAdded} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <SavedCardRow key={card.id} card={card} />
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" /> Karta qo&apos;shish
          </Button>
        </div>
      </div>
      {showAddModal && (
        <CardAddModal onClose={() => setShowAddModal(false)} onAdded={handleAdded} />
      )}
    </>
  );
}

// -------------------- saved-card row --------------------

function SavedCardRow({ card }: { card: CardResponse }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  const brandLabel = BRAND_LABEL[card.brand] ?? card.brand;
  const expiry = `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;

  const handleDelete = useCallback(() => {
    setError(null);
    startPending(async () => {
      const res = await fetch(`/api/trade/v1/cards/${encodeURIComponent(card.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        setError("Kartani o'chirib bo'lmadi");
        setArmed(false);
        return;
      }
      // Re-fetch server state so the tab redraws without the row.
      router.refresh();
    });
  }, [card.id, router]);

  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors',
        armed && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid h-10 w-14 shrink-0 place-items-center rounded-md bg-primary/10 text-[10px] font-black tracking-wider text-primary">
          {brandLabel}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm tracking-wider text-foreground">
            •••• •••• •••• {card.last4}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Amal qilish muddati: {expiry}
          </p>
          {error && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {error}
            </p>
          )}
        </div>
        {armed ? (
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  O&apos;chirilmoqda…
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" /> Tasdiqlash
                </>
              )}
            </Button>
            <button
              type="button"
              className="text-[10px] text-muted-foreground underline underline-offset-2 disabled:opacity-50"
              onClick={() => setArmed(false)}
              disabled={pending}
            >
              Bekor
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              setArmed(true);
              setError(null);
            }}
            aria-label="Kartani o'chirish"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

const BRAND_LABEL: Partial<Record<CardBrand, string>> = {
  VISA: 'VISA',
  MC: 'MC',
  UZCARD: 'UZCARD',
  HUMO: 'HUMO',
  UNKNOWN: '••••',
};

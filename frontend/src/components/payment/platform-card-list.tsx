'use client';

import { useState } from 'react';

import { AddCardForm } from '@/components/payment/add-card-form';
import { PlatformCard } from '@/components/payment/platform-card';
import {
  activateCard,
  deactivateCard,
  listPlatformCards,
  reorderCards,
} from '@/lib/payment-admin-client';
import type { PlatformCardResponse } from '@/lib/payment-types';
import { moveCard, orderedIds, splitCards } from '@/lib/platform-card-order';

interface PlatformCardListProps {
  initialCards: PlatformCardResponse[];
}

/**
 * The admin card manager. Server-rendered once, then kept in client state:
 * every mutation is followed by a full re-read, because `display_order` is
 * rewritten server-side for the whole active set and a locally patched copy
 * would drift.
 */
export function PlatformCardList({ initialCards }: PlatformCardListProps) {
  const [cards, setCards] = useState(initialCards);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { active, inactive } = splitCards(cards);

  /** A failed re-read keeps what is on screen rather than blanking the page. */
  async function refresh() {
    const fresh = await listPlatformCards().catch(() => null);
    if (fresh) setCards(fresh);
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Amal bajarilmadi.');
    }
    // Re-read either way: on success for the new display_order, on failure to
    // drop an optimistic move the server never accepted.
    await refresh();
    setBusy(false);
  }

  function handleMove(id: string, delta: -1 | 1) {
    const moved = moveCard(active, id, delta);
    if (moved === active) return;
    // Show the new order at once; `run` reconciles with the server.
    setCards([...moved, ...inactive]);
    void run(() => reorderCards(orderedIds(moved)));
  }

  return (
    <div className="space-y-5">
      <AddCardForm onAdded={() => void refresh()} />

      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      <section>
        <h2 className="text-base font-black text-foreground">
          Faol kartalar{active.length > 0 && ` (${active.length})`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Yangi hisob to&apos;ldirish so&apos;rovi ro&apos;yxatdagi birinchi bo&apos;sh kartaga
          biriktiriladi — tartibni o&apos;zgartirish uchun strelkalardan foydalaning.
        </p>

        {active.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Faol karta yo&apos;q. Hisob to&apos;ldirish kamida bitta faol karta bo&apos;lgandagina
            ishlaydi.
          </p>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {active.map((card, index) => (
              <li key={card.id}>
                <PlatformCard
                  card={card}
                  position={index + 1}
                  busy={busy}
                  onDeactivate={(id) => void run(() => deactivateCard(id))}
                  onActivate={(id) => void run(() => activateCard(id))}
                  onMoveUp={index > 0 ? (id) => handleMove(id, -1) : undefined}
                  onMoveDown={index < active.length - 1 ? (id) => handleMove(id, 1) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {inactive.length > 0 && (
        <section>
          <h2 className="text-base font-black text-foreground">
            O&apos;chirilgan kartalar ({inactive.length})
          </h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {inactive.map((card) => (
              <li key={card.id}>
                <PlatformCard
                  card={card}
                  busy={busy}
                  onDeactivate={(id) => void run(() => deactivateCard(id))}
                  onActivate={(id) => void run(() => activateCard(id))}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';

import { UnmatchedRow } from '@/components/payment/unmatched-row';
import {
  ignoreObservation,
  listUnmatched,
  PaymentAdminError,
  resolveObservation,
} from '@/lib/payment-admin-client';
import type { ObservationResponse } from '@/lib/payment-types';

interface UnmatchedQueueProps {
  initialItems: ObservationResponse[];
}

/**
 * Every card credit the matcher could not attribute to an invoice.
 *
 * Server-rendered once, then kept in client state. Both actions take the row
 * out of the list because both move its status away from `UNMATCHED`, and
 * `ByCardService` only ever returns `UNMATCHED` rows here.
 */
export function UnmatchedQueue({ initialItems }: UnmatchedQueueProps) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** A failed re-read keeps what is on screen rather than blanking the page. */
  async function refresh() {
    const fresh = await listUnmatched().catch(() => null);
    if (fresh) setItems(fresh);
  }

  function drop(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      drop(id);
    } catch (err) {
      if (err instanceof PaymentAdminError && err.status === 409) {
        // `resolveManually` / `markIgnored` answer 409 only when the row is no
        // longer UNMATCHED — another admin got there first. Nothing broke and
        // nothing was lost: the row is simply gone, so drop it and re-read
        // rather than showing the admin a raw conflict message.
        drop(id);
        await refresh();
      } else {
        setError(err instanceof Error ? err.message : 'Amal bajarilmadi.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-base font-black text-foreground">
          Tekshirilmagan tushumlar{items.length > 0 && ` (${items.length})`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bu to&apos;lovlarni tizim hech qanday hisob to&apos;ldirish so&apos;roviga
          bog&apos;lay olmadi. Biriktirish — pulni foydalanuvchi hisobiga qo&apos;shadi va
          ortga qaytarib bo&apos;lmaydi.
        </p>
      </section>

      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Tekshirilmagan tushum yo&apos;q — barcha to&apos;lovlar biriktirilgan.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <UnmatchedRow
                item={item}
                busy={busyId === item.id}
                onResolve={(userId, note) =>
                  void run(item.id, () => resolveObservation(item.id, userId, note))
                }
                onIgnore={(note) => void run(item.id, () => ignoreObservation(item.id, note))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

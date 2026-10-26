'use client';

import { ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react';
import { useState } from 'react';

import {
  cardsInHistory,
  dayBarWidths,
  groupByDay,
  movementBadge,
  movementDetail,
} from '@/lib/card-history';
import { formatTiyin } from '@/lib/money';
import { MONEY_COLORS } from '@/lib/payment-analytics';
import { listCardHistory } from '@/lib/payment-admin-client';
import type { CardMovement } from '@/lib/payment-types';
import { cn } from '@/lib/utils';

/** The same two colours the finance panel uses: money in, money out. */
const IN_COLOR = MONEY_COLORS.own;
const OUT_COLOR = MONEY_COLORS.users;

interface CardHistoryProps {
  initialMovements: CardMovement[];
  /**
   * What counts as "today" for the day headings. Passed in rather than read
   * from the clock so a server render and its hydration cannot disagree across
   * midnight — React fails on that mismatch.
   */
  now: Date;
}

function Som({ tiyin }: { tiyin: number }) {
  return (
    <>
      {formatTiyin(tiyin)} <span className="text-[0.75em] font-semibold">so&apos;m</span>
    </>
  );
}

/**
 * What has actually moved on the platform's cards.
 *
 * Credits and debits in one list, grouped into days. They are two tables on the
 * backend — a debit must never reach the credit reconciliation queue, where it
 * could be attributed to a user and create money — but "what happened today" is
 * one question, and an admin interleaving two lists by eye is how a movement
 * gets missed.
 *
 * The day is the Tashkent day, matching the bank's own notices: a payout at
 * 01:34 local is 20:34 the previous day in UTC, and filing it under the UTC day
 * would put it where nobody reconciling against the notice would look.
 */
export function CardHistory({ initialMovements, now }: CardHistoryProps) {
  const [movements, setMovements] = useState(initialMovements);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Held from the first, unfiltered page: narrowing to one card must not make
  // the other cards' chips disappear, which would leave no way back.
  const [cards] = useState(() => cardsInHistory(initialMovements));
  const days = groupByDay(movements, now);

  async function select(last4: string | null) {
    setSelected(last4);
    setBusy(true);
    setError(null);
    try {
      setMovements(await listCardHistory(last4 ?? undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarixni olishda xatolik.');
    }
    setBusy(false);
  }

  return (
    <section>
      <h2 className="text-base font-black text-foreground">Karta harakatlari</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Userbot ko&apos;rgan kirim va chiqimlar. Bu bank aytgan haqiqat &mdash; adminka
        yozuvlari emas, shuning uchun ikkisi farq qilsa shu yerdan boshlanadi.
      </p>

      {cards.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterChip active={selected === null} busy={busy} onClick={() => void select(null)}>
            Barchasi
          </FilterChip>
          {cards.map((last4) => (
            <FilterChip
              key={last4}
              active={selected === last4}
              busy={busy}
              onClick={() => void select(last4)}
            >
              •••• {last4}
            </FilterChip>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      {days.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Hozircha harakat yo&apos;q. Userbot birinchi xabarni ko&apos;rgach shu yerda
          paydo bo&apos;ladi.
        </p>
      ) : (
        <div className={cn('mt-4 space-y-6', busy && 'opacity-60')}>
          {days.map((day) => (
            <DayGroup key={day.key} day={day} days={days} />
          ))}

          <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Oxirgi {movements.length} ta harakat ko&apos;rsatilmoqda
          </p>
        </div>
      )}
    </section>
  );
}

function FilterChip({
  active,
  busy,
  onClick,
  children,
}: {
  active: boolean;
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-40',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function DayGroup({
  day,
  days,
}: {
  day: ReturnType<typeof groupByDay>[number];
  days: ReturnType<typeof groupByDay>;
}) {
  const { inPercent, outPercent } = dayBarWidths(day, days);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="text-sm font-black text-foreground">{day.label}</h3>
        <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: IN_COLOR }}
            aria-hidden="true"
          />
          Kirim {formatTiyin(day.inTiyin)}
        </span>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: OUT_COLOR }}
            aria-hidden="true"
          />
          Chiqim {formatTiyin(day.outTiyin)}
        </span>
      </div>

      {/* One scale across every day on screen, so a quiet day looks quiet. */}
      <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="rounded-full" style={{ width: `${inPercent}%`, backgroundColor: IN_COLOR }} />
        <div className="rounded-full" style={{ width: `${outPercent}%`, backgroundColor: OUT_COLOR }} />
      </div>

      <ul className="mt-3 space-y-2">
        {day.movements.map((movement) => (
          <MovementRow key={movement.id} movement={movement} />
        ))}
      </ul>
    </div>
  );
}

function MovementRow({ movement }: { movement: CardMovement }) {
  const outgoing = movement.direction === 'OUT';
  const detail = movementDetail(movement);
  const badge = movementBadge(movement);
  const color = outgoing ? OUT_COLOR : IN_COLOR;
  const Icon = outgoing ? ArrowUpRight : ArrowDownLeft;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-3">
      {/* The icon, the sign and the screen-reader word all say the direction.
          The colour only reinforces it — it never carries the meaning alone. */}
      <span
        className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", outgoing ? "bg-info-soft" : "bg-success-soft")}
        style={{ color }}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-[8.5rem]">
        <p className="text-sm font-black tabular-nums text-foreground">
          <span className="sr-only">{outgoing ? 'Chiqim' : 'Kirim'}: </span>
          {outgoing ? '−' : '+'}
          <Som tiyin={movement.amountTiyin} />
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          •••• {movement.cardLast4}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        {detail && <p className="truncate text-sm text-muted-foreground">{detail}</p>}
        {badge && (
          <span className="mt-1 inline-block rounded-full border border-border bg-muted px-2 py-0.5 text-[0.7rem] font-bold text-muted-foreground">
            {badge}
          </span>
        )}
      </div>

      <div className="ml-auto shrink-0 text-right">
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatClock(movement.observedAt)}
        </p>
        {movement.cardBalanceTiyin != null && (
          <p className="text-xs tabular-nums text-muted-foreground">
            qoldiq {formatTiyin(movement.cardBalanceTiyin)}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * `HH:mm` in Tashkent. The date is already the group heading, so repeating it
 * on every row is noise — and this is the clock the bank's own notice printed.
 */
function formatClock(iso: string): string {
  const local = new Date(new Date(iso).getTime() + 5 * 60 * 60 * 1000);
  const hour = String(local.getUTCHours()).padStart(2, '0');
  const minute = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

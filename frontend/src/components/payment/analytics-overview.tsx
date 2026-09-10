import { Info } from 'lucide-react';

import { formatListingDate } from '@/lib/marketplace-format';
import { formatTiyin } from '@/lib/money';
import {
  ledgerDrift,
  moneySplit,
  profitRows,
  referralPer100,
  shortfallTiyin,
} from '@/lib/payment-analytics';
import type { PaymentAnalyticsOverview } from '@/lib/payment-types';

function Som({ tiyin }: { tiyin: number }) {
  return (
    <>
      {formatTiyin(tiyin)} <span className="text-[0.7em] font-semibold">so&apos;m</span>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-black tabular-nums text-foreground">
        <Som tiyin={value} />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * The identity panel: whose money is on the cards, and do the cards actually
 * hold it.
 *
 * The bar is labelled on both sides — the two colours are validated for
 * colour-vision deficiency but are never the only thing saying which slice is
 * which.
 */
function WhoseMoney({ data }: { data: PaymentAnalyticsOverview }) {
  const slices = moneySplit(data);
  const shortfall = shortfallTiyin(data);
  const drift = ledgerDrift(data);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
            Kartalardagi jami pul
          </p>
          <p className="mt-2 text-3xl font-black tabular-nums text-foreground sm:text-4xl">
            <Som tiyin={data.ledgerCardsTiyin} />
          </p>
        </div>

        {/* The one figure on this screen that comes from outside the books.
            Everything else balances against itself by construction. */}
        <p className="text-sm font-semibold text-muted-foreground">
          {drift.kind === 'match' && 'Userbot ko‘rgan qoldiq bilan mos'}
          {drift.kind === 'unknown'
            && `${drift.unobservedCards} ta karta qoldig‘i noma’lum — solishtirib bo‘lmaydi`}
          {drift.kind === 'drift' && (
            <>
              Userbot ko‘rgan qoldiq {drift.tiyin > 0 ? 'ko‘p' : 'kam'}:{' '}
              <span className="tabular-nums text-foreground">
                <Som tiyin={Math.abs(drift.tiyin)} />
              </span>
            </>
          )}
        </p>
      </div>

      <div className="mt-5 flex h-10 gap-0.5 overflow-hidden rounded-lg" aria-hidden="true">
        {slices.map((slice) => (
          <div
            key={slice.label}
            className="first:rounded-l-lg last:rounded-r-lg"
            style={{ width: `${slice.percent}%`, backgroundColor: slice.color }}
          />
        ))}
        {/* Nothing to divide yet: an empty rail beats an empty box. */}
        {slices.every((s) => s.percent === 0) && (
          <div className="flex-1 rounded-lg bg-muted" />
        )}
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {slices.map((slice) => (
          <div key={slice.label} className="flex items-start gap-3">
            <span
              className="mt-1.5 h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: slice.color }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <dt className="text-sm font-black text-foreground">{slice.label}</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">
                <Som tiyin={slice.tiyin} />
              </dd>
            </div>
          </div>
        ))}
      </dl>

      {shortfall > 0 && (
        <p className="mt-4 rounded-xl border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
          Kartalardagi pul foydalanuvchilar oldidagi majburiyatdan{' '}
          <span className="font-bold tabular-nums text-foreground">
            <Som tiyin={shortfall} />
          </span>{' '}
          kam. Bu farqni platforma o&apos;z hisobidan qoplaydi.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tile
          label="Hisobda bo'sh"
          value={data.userAvailableTiyin}
          hint="yechib olinishi mumkin"
        />
        <Tile
          label="Savdoda muzlatilgan"
          value={data.userHeldTiyin}
          hint="ochiq savdolarda"
        />
        <Tile
          label="Yechish navbatida"
          value={data.userWithdrawPendingTiyin}
          hint="to'lovi kutilmoqda"
        />
      </div>
    </section>
  );
}

/**
 * The profit panel.
 *
 * A negative net is drawn exactly like a positive one — same size, same ink, no
 * warning colour. Referral rewards are what the platform pays to grow, and
 * spending more than the commission brings in is how that looks while it is
 * working. Marking it as a fault would train the reader to fix the wrong thing.
 */
function Profit({ data }: { data: PaymentAnalyticsOverview }) {
  const rows = profitRows(data.revenueByKind);
  const per100 = referralPer100(data);
  const loss = data.netTiyin < 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-3xl font-black tabular-nums text-foreground sm:text-4xl">
          {loss ? '−' : '+'}
          <Som tiyin={Math.abs(data.netTiyin)} />
        </p>
        <p className="text-sm font-bold text-muted-foreground">
          {loss ? 'sarf tushumdan ko‘p' : 'foydada'}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Butun davr uchun · komissiyadan referal va xarajat ayirilgan
      </p>

      {rows.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Hali birorta ham komissiya yoki mukofot yozilmagan.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.direction}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-foreground">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{
                      backgroundColor:
                        row.direction === 'in' ? '#059669' : '#6C7FD4',
                    }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {row.direction === 'in' ? '+' : '−'}
                  {formatTiyin(row.tiyin)}
                </span>
              </div>
              <div
                className="mt-1.5 h-3 rounded"
                style={{
                  width: `${row.percent}%`,
                  backgroundColor: row.direction === 'in' ? '#059669' : '#6C7FD4',
                }}
                aria-hidden="true"
              />
            </li>
          ))}
        </ul>
      )}

      {data.feesTiyin > 0 && (
        <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
          Bank xarajatlari:{' '}
          <span className="font-bold tabular-nums text-foreground">
            <Som tiyin={data.feesTiyin} />
          </span>
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <p className="text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
            Har 100 so&apos;m tushumdan
          </p>
          <p className="mt-2 text-xl font-black tabular-nums text-foreground">
            {/* A ratio against zero earnings is not 0% — it is unanswered. */}
            {per100 === null ? '—' : `${per100} so'm`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">referalga ketdi</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
            Mukofot olganlar
          </p>
          <p className="mt-2 text-xl font-black tabular-nums text-foreground">
            {data.referralRecipients} ta
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.referralPayouts} to&apos;lov ·{' '}
            <span className="tabular-nums">{formatTiyin(data.referralRewardTiyin)}</span> so&apos;m
          </p>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Referal mukofoti — o&apos;sish uchun qilingan sarf, yo&apos;qotilgan pul emas.
          Minus natija platformaning yomon ishlayotganini bildirmaydi.
        </span>
      </p>
    </section>
  );
}

/**
 * The finance dashboard above the card list.
 *
 * Two questions, in the order an owner asks them: whose money is on the cards,
 * and what is left of the commission.
 */
export function AnalyticsOverview({ data }: { data: PaymentAnalyticsOverview }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <WhoseMoney data={data} />
        <Profit data={data} />
      </div>
      <p className="text-xs text-muted-foreground">
        Hisoblangan vaqt: {formatListingDate(data.computedAt)}
      </p>
    </div>
  );
}

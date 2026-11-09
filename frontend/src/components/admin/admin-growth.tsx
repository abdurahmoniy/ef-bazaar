'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, TrendingUp } from 'lucide-react';

import {
  barHeights,
  fetchChannelSummary,
  fetchSignups,
  netLabel,
  type ChannelSummary,
  type SignupSummary,
} from '@/lib/admin-growth';
import { cn } from '@/lib/utils';

const PERIODS = [7, 30, 90] as const;
const CHART_HEIGHT = 96;

function dayLabel(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(d)}.${m}`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Kunlik ro'yxatdan o'tishlar — bitta qator, shuning uchun legend o'rniga sarlavha. */
function SignupChart({ daily }: { daily: SignupSummary['daily'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const heights = barHeights(daily.map((d) => d.count), CHART_HEIGHT);
  const shown = hover === null ? null : daily[hover];

  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">Kunlik ro‘yxatdan o‘tishlar</span>
        <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {shown ? `${dayLabel(shown.date)}: ${shown.count} kishi` : 'Ustun ustiga olib boring'}
        </span>
      </figcaption>
      <div
        className="flex items-end gap-[2px] border-b border-border"
        style={{ height: CHART_HEIGHT }}
        onMouseLeave={() => setHover(null)}
        aria-hidden="true"
      >
        {daily.map((d, i) => (
          // Hit target is the full column height, wider than the thin bar inside it.
          <div
            key={d.date}
            className="flex h-full min-w-0 flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
            title={`${dayLabel(d.date)}: ${d.count}`}
          >
            <div
              className={cn('w-full rounded-t-[4px] bg-primary transition-opacity', hover !== null && hover !== i && 'opacity-40')}
              style={{ height: heights[i] }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
        <span>{daily[0] && dayLabel(daily[0].date)}</span>
        <span>{daily.at(-1) && dayLabel(daily.at(-1)!.date)}</span>
      </div>
      <table className="sr-only">
        <caption>Kunlik ro‘yxatdan o‘tishlar</caption>
        <thead><tr><th>Sana</th><th>Soni</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.count}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/**
 * Adminka "O'sish": umumiy oqim (auth), kanalga obuna/chiqish (marketplace) va
 * manba bo'yicha voronkaga havola. Kampaniya raqamlari alohida sahifada —
 * bu yer "o'syaptimi?", u yer "nima tufayli?".
 */
export function AdminGrowth() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [signups, setSignups] = useState<SignupSummary | null>(null);
  const [channel, setChannel] = useState<ChannelSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([fetchSignups(days), fetchChannelSummary(days)])
      .then(([s, c]) => {
        if (!active) return;
        setSignups(s);
        setChannel(c);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Yuklanmadi'));
    return () => {
      active = false;
    };
  }, [days]);

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><TrendingUp className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-bold">O‘sish</h1>
            <p className="text-sm text-muted-foreground">Yangi foydalanuvchilar va rasmiy kanalga obuna, Toshkent vaqti bo‘yicha.</p>
          </div>
        </div>
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Davr">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={days === p}
              onClick={() => setDays(p)}
              className={cn('min-h-9 rounded-md px-3 text-xs font-medium', days === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {p} kun
            </button>
          ))}
        </div>
      </header>

      {error && <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {!signups || !channel ? (
        !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Jami foydalanuvchi" value={String(signups.total)} />
            <Tile label={`${days} kunda yangi`} value={String(signups.inPeriod)} hint={`kuniga ~${(signups.inPeriod / days).toFixed(1)}`} />
            {channel.configured ? (
              <>
                <Tile label="Kanalga qo‘shildi" value={String(channel.joins)} />
                <Tile label="Kanaldan chiqdi" value={String(channel.leaves)} hint={`sof: ${netLabel(channel.joins, channel.leaves)}`} />
              </>
            ) : (
              <div className="col-span-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                Rasmiy kanal (<code>OFFICIAL_CHANNEL</code>) sozlanmagan — obuna statistikasi yig‘ilmayapti.
              </div>
            )}
          </div>

          <section className="rounded-xl border border-border bg-card p-4">
            <SignupChart daily={signups.daily} />
          </section>

          {channel.configured && (
            <p className="text-xs text-muted-foreground">
              Kanal statistikasi bot <code>chat_member</code> hodisalarini qabul qila boshlagan kundan yig‘iladi; undan oldingi davr nol ko‘rinadi.
            </p>
          )}

          <Link href="/admin/campaigns" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-muted">
            Qaysi manba odam olib kelyapti — Kampaniyalar <ArrowRight className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}

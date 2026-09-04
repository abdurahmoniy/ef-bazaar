'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  bpToPercent,
  getChannelPayouts,
  percentToBp,
  updateChannelPayout,
  type ChannelPayoutRow,
} from '@/lib/partners';

/**
 * Har bir hamkorga alohida shart.
 *
 * <p>BO'SH MAYDON — globalga ergashish, nol emas. Global qiymatni
 * nusxalab qo'ysak, admin keyin global sozlamani o'zgartirganda bu
 * kanal jimgina eski shartda qolib ketardi — bu aynan sozlamani
 * o'zgartirishning maqsadiga zid.
 */
function PayoutRow({ row, onSaved }: { row: ChannelPayoutRow; onSaved: (rows: ChannelPayoutRow[]) => void }) {
  const [mode, setMode] = useState<string>(row.payoutMode ?? '');
  const [percent, setPercent] = useState(
    row.tradePercentBp === null ? '' : String(bpToPercent(row.tradePercentBp)),
  );
  const [monthly, setMonthly] = useState(
    row.fixedMonthlySom === null ? '' : String(row.fixedMonthlySom),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      onSaved(
        await updateChannelPayout(row.channelId, {
          payoutMode: mode === '' ? null : (mode as 'PERCENT' | 'FIXED'),
          tradePercentBp: percent === '' ? null : percentToBp(Number(percent)),
          fixedMonthlySom: monthly === '' ? null : Number(monthly),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saqlanmadi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className={row.active ? '' : 'opacity-60'}>
      <td className="px-4 py-2.5">
        <span className="block truncate font-medium">{row.title}</span>
        <span className="text-xs text-muted-foreground">
          {row.active ? 'faol' : 'yopilgan'} · e&apos;lon narxi{' '}
          {row.postPriceSom.toLocaleString('uz-UZ')}
        </span>
      </td>
      <td className="px-2 py-2.5">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          aria-label={`${row.title} — to'lov rejimi`}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Global ({row.effectivePayoutMode === 'PERCENT' ? 'foiz' : 'fiks'})</option>
          <option value="PERCENT">Foiz</option>
          <option value="FIXED">Fiks</option>
        </select>
      </td>
      <td className="px-2 py-2.5">
        <input
          type="number"
          step="0.01"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          placeholder={String(bpToPercent(row.effectiveTradePercentBp))}
          aria-label={`${row.title} — foiz`}
          className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
      </td>
      <td className="px-2 py-2.5">
        <input
          type="number"
          min={0}
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
          placeholder={String(row.effectiveFixedMonthlySom)}
          aria-label={`${row.title} — oylik summa`}
          className="w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
      </td>
      <td className="px-4 py-2.5">
        <Button size="sm" variant="outline" onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Saqlash
        </Button>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
    </tr>
  );
}

/** Sozlash tabidagi hamkorlar ro'yxati. */
export function AdminPartnerPayouts() {
  const [rows, setRows] = useState<ChannelPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getChannelPayouts()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Yuklanmadi'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
      </p>
    );
  }
  if (error) {
    return <p className="p-3 text-sm text-destructive">{error}</p>;
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Hamkorlarga alohida shart</h3>
        <p className="text-xs text-muted-foreground">
          Bo&apos;sh qoldirilgan maydon global sozlamaga ergashadi. Kulrang matn — hozir amalda
          bo&apos;lgan qiymat.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Hali hamkor kanallari yo&apos;q.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Kanal</th>
                <th className="px-2 py-2 font-medium">Rejim</th>
                <th className="px-2 py-2 font-medium">Foiz (%)</th>
                <th className="px-2 py-2 font-medium">Oylik (so&apos;m)</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <PayoutRow key={row.channelId} row={row} onSaved={setRows} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

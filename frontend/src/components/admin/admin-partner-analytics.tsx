'use client';

import { useEffect, useState } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';

import {
  conversionRate,
  formatSom,
  funnelVerdict,
  getPartnerFunnel,
  sortByRevenue,
  type PartnerFunnelRow,
} from '@/lib/admin-partner-analytics';

/**
 * Kanal kesimidagi voronka.
 *
 * <p>VORONKA — asosiy narsa, daromad emas. Ko'p bosilib savdosiz
 * qolgan kanal, umuman bosilmagan kanaldan boshqa muammo, va bitta
 * daromad ustuni adminga ularning qaysi biri ekanini ayta olmaydi.
 */
export function AdminPartnerAnalytics() {
  const [rows, setRows] = useState<PartnerFunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPartnerFunnel()
      .then((found) => setRows(sortByRevenue(found)))
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
    return (
      <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
        <TrendingUp className="h-4 w-4" />
        Kanallar voronkasi
      </h2>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Hali hamkor kanallari yo&apos;q.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Kanal</th>
                <th className="px-3 py-2 text-right font-medium">Bosilish</th>
                <th className="px-3 py-2 text-right font-medium">Ro&apos;yxat</th>
                <th className="px-3 py-2 text-right font-medium">Chiqdi</th>
                <th className="px-3 py-2 text-right font-medium">Konversiya</th>
                <th className="px-3 py-2 text-right font-medium">Daromad</th>
                <th className="px-4 py-2 font-medium">Holat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.channelId} className={row.active ? '' : 'opacity-60'}>
                  <td className="px-4 py-2.5">
                    <span className="block truncate font-medium">{row.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.subscriberCount.toLocaleString('uz-UZ')} obunachi
                      {!row.active && ' · yopilgan'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.clicks}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.registrations}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.postsDelivered}
                    {row.postsRefunded > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({row.postsRefunded} qaytdi)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{conversionRate(row)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {formatSom(row.revenueSom)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {funnelVerdict(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

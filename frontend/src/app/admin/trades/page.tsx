import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ACTION_LABEL_UZ, sinceLabel } from '@/lib/smart-trade-admin';
import { getActiveSmartTrades } from '@/lib/smart-trade-admin-server';
import { TRADE_STATE_LABEL_UZ } from '@/lib/trade-types';

export const dynamic = 'force-dynamic';

/**
 * "Faol savdolar" — live SMART trades. The ones waiting for an admin's hand
 * (the worker could not read Konami's mail) come first.
 *
 * HUMAN trades are not here: they have their own section and a person already
 * working them.
 */
export default async function AdminTradesPage() {
  const result = await getActiveSmartTrades();
  if (!result.ok) {
    return <ApiErrorPanel title="Savdolar yuklanmadi" error={result.error} />;
  }
  const rows = result.data;
  // Resolved once on the server so every row measures from the same instant.
  const now = new Date();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-black text-foreground">Faol savdolar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Smart admin yuritayotgan savdolar. Smart admin qiymatni aniqlay olmasa, savdoni ochib
          pochtadan o&apos;zingiz kiritasiz.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Hozir faol smart savdo yo&apos;q.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Savdo</th>
                <th className="px-4 py-3">Sotuvchi</th>
                <th className="px-4 py-3">Oluvchi</th>
                <th className="px-4 py-3">Bosqich</th>
                <th className="px-4 py-3">Shu bosqichda</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/trades/${row.id}`}
                      className="font-mono text-xs font-bold text-foreground underline-offset-2 hover:underline"
                    >
                      {row.id.slice(0, 8)}
                    </Link>
                    {row.kind !== 'SALE' && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-bold text-muted-foreground">
                        Obmen
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">{row.sellerName ?? "o'chirilgan"}</td>
                  <td className="px-4 py-3 text-foreground">{row.buyerName ?? "o'chirilgan"}</td>
                  <td className="px-4 py-3">
                    <span className="text-foreground">{TRADE_STATE_LABEL_UZ[row.state]}</span>
                    {row.expectedAction !== 'NONE' && (
                      <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        {ACTION_LABEL_UZ[row.expectedAction]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {sinceLabel(row.stateSince, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

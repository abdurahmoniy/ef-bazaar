'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatPlanDate } from '@/lib/plans';
interface PlanNotice { id: string; kind: 'EXPIRING' | 'EXPIRED' | 'GRACE_ENDED'; paidExpiresAt: string; graceEndsAt: string | null; createdAt: string; readAt: string | null }
export function PlanNotices() {
  const [notices, setNotices] = useState<PlanNotice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { const response = await fetch('/api/payment/v1/payments/plans/notices', { credentials: 'include', cache: 'no-store' }); if (!response.ok) throw new Error('Tarif xabarlari yuklanmadi'); const rows: PlanNotice[] = await response.json(); setNotices([...new Map(rows.map(n => [n.id, n])).values()].filter(n => !n.readAt)); } catch { setError('Tarif xabarlari yuklanmadi. Qayta urinib ko‘ring.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function read(id: string) {
    if (busy) return; setBusy(id); setError(null);
    try { const response = await fetch(`/api/payment/v1/payments/plans/notices/${encodeURIComponent(id)}/read`, { method: 'POST', credentials: 'include' }); if (!response.ok) throw new Error(); setNotices(rows => rows.filter(n => n.id !== id)); } catch { setError('Xabar o‘qilgan deb belgilanmadi. Qayta urinib ko‘ring.'); } finally { setBusy(null); }
  }
  if (!notices.length && !error) return null;
  return <section aria-label="Tarif xabarlari" className="space-y-3">{notices.map(notice => <article key={notice.id} className="space-y-2 rounded-xl border border-warning-border bg-warning-soft p-4 text-sm">
    <h2 className="font-bold">{notice.kind === 'EXPIRING' ? 'Pro muddati tugayapti' : notice.kind === 'EXPIRED' ? 'Pro muddati tugadi' : 'Pro obunasini yangilang'}</h2>
    <p>Pro tugash sanasi: {formatPlanDate(notice.paidExpiresAt)}</p>
    <div className="flex flex-wrap items-center gap-3"><Link className="inline-flex min-h-11 items-center font-semibold underline" href="/plans">Pro uzaytirish</Link><Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void read(notice.id)}>O‘qildim</Button></div>
  </article>)}{error && <div><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => void load()}>Qayta urinish</Button></div>}</section>;
}

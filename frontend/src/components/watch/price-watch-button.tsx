'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WatchRequestError, watchRequest } from '@/lib/watches-client';

export function PriceWatchButton({ listingId, authenticated, compact = false }: { listingId: string; authenticated: boolean; compact?: boolean }) {
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  async function create() {
    if (busy.current || saved) return;
    busy.current = true; setPending(true); setError('');
    try { await watchRequest('price', '', 'POST', { listingId }); setSaved(true); }
    catch (problem) {
      if (problem instanceof WatchRequestError && problem.code === 'watch_entitlement_unavailable') {
        try {
          const response = await fetch('/api/payment/v1/payments/plans/me', {
            credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error('payment unavailable');
          setError('Tarif yangilanmoqda. Birozdan so‘ng qayta urinib ko‘ring.');
        } catch {
          setError('Tarifni hozir aniqlab bo‘lmadi. Qayta urinib ko‘ring.');
        }
      } else setError((problem as Error).message);
    }
    finally { busy.current = false; setPending(false); }
  }
  const label = <><Bell aria-hidden className="h-4 w-4" /><span>{pending ? 'Saqlanmoqda…' : 'Narxni kuzatish'}</span></>;
  return <div className="space-y-1">
    {saved ? <p role="status" className="text-xs text-muted-foreground">Kuzatuv saqlandi. <Link href="/watches" className="inline-flex min-h-11 items-center font-semibold text-primary dark:text-secondary underline underline-offset-4">Xabar sozlamalarini ko‘rish</Link></p>
      : authenticated ? <Button type="button" variant="outline" className={compact ? 'min-h-11 w-full text-xs' : 'min-h-11 w-full'} onClick={() => void create()} disabled={pending}>{label}</Button>
      : <Button asChild variant="outline" className="min-h-11 w-full"><Link href={`/auth/login?from=${encodeURIComponent(`/marketplace/${listingId}`)}`}>{label}</Link></Button>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

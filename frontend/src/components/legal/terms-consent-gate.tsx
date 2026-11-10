'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { OFERTA_HREF, PRIVACY_HREF, TERMS_VERSION } from '@/lib/legal';

const CONSENT_ENDPOINT = '/api/legal/consent';

/**
 * Kirgan foydalanuvchi oferta va maxfiylik siyosatining joriy versiyasiga
 * rozi bo'lmagan bo'lsa, rozilikni so'raydi. Login sahifasidagi matn Telegram
 * va Google'ni qoplaydi, Mini App esa avtomatik kiradi — shuning uchun
 * rozilik shu yerda, har qanday kirish yo'lidan keyin olinadi.
 */
export function TermsConsentGate() {
  const pathname = usePathname();
  const onLegalPage = pathname === OFERTA_HREF || pathname === PRIVACY_HREF;
  const [required, setRequired] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const acceptRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (onLegalPage) return;
    let cancelled = false;
    fetch(CONSENT_ENDPOINT, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { required: false }))
      .then((body: { required?: boolean }) => {
        if (!cancelled) setRequired(body.required === true);
      })
      .catch(() => undefined); // tekshiruv ishlamasa saytni to'smaymiz
    return () => { cancelled = true; };
  }, [onLegalPage]);

  React.useEffect(() => {
    if (required && !onLegalPage) acceptRef.current?.focus();
  }, [required, onLegalPage]);

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(CONSENT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: TERMS_VERSION }),
      });
      if (!res.ok) throw new Error('consent not saved');
      setRequired(false);
    } catch {
      setError('Rozilik saqlanmadi. Qayta urinib ko‘ring.');
    } finally {
      setSaving(false);
    }
  }

  if (!required || onLegalPage) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-consent-title"
        className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl"
      >
        <h2 id="terms-consent-title" className="text-lg font-bold text-foreground">
          Platforma shartlari
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          efBazaar’dan foydalanishni davom ettirish uchun{' '}
          <Link href={OFERTA_HREF} className="font-semibold text-primary underline">ommaviy oferta</Link>
          {' '}va{' '}
          <Link href={PRIVACY_HREF} className="font-semibold text-primary underline">maxfiylik siyosati</Link>
          ga rozilik bildiring.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p>
        )}
        <Button ref={acceptRef} type="button" className="mt-4 min-h-11 w-full" disabled={saving} onClick={accept}>
          {saving ? 'Saqlanmoqda…' : 'Roziman'}
        </Button>
      </div>
    </div>
  );
}

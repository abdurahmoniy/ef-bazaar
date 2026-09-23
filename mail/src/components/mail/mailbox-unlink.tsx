'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2Off, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function MailboxUnlink({ mailboxId, email }: { mailboxId: string; email: string }) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (confirming) cancel.current?.focus();
  }, [confirming]);

  function dismiss() {
    if (inFlight.current) return;
    setConfirming(false);
    setError(null);
    trigger.current?.focus();
  }

  async function unlink() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/trade/v1/mailboxes/${encodeURIComponent(mailboxId)}/detach`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (response.status !== 204) {
        const payload = await response.json().catch(() => null);
        const message = response.status === 401
          ? 'Hisobingizga qayta kiring va yana urinib ko‘ring.'
          : response.status === 404
            ? 'Bu pochta endi hisobingizga biriktirilmagan. Sahifani yangilang.'
            : typeof payload?.message === 'string'
              ? payload.message
              : 'Pochtani uzib bo‘lmadi. Qayta urinib ko‘ring.';
        throw new Error(message);
      }
      // Leave the revoked inbox and refetch the shared mailbox sidebar.
      router.replace('/');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof TypeError
        ? 'Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.'
        : cause instanceof Error ? cause.message : 'Pochtani uzib bo‘lmadi.');
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="min-w-0" onKeyDown={(event) => {
      if (event.key === 'Escape' && confirming) {
        event.preventDefault();
        dismiss();
      }
    }}>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full text-muted-foreground"
        aria-expanded={confirming}
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        <Link2Off aria-hidden="true" />
        Hisobimdan uzish
      </Button>
      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          aria-busy={pending}
          className="mt-3 max-w-md space-y-3 rounded-xl border border-destructive/25 bg-card p-4 text-sm"
        >
          <h2 id={titleId} className="font-bold text-foreground">Pochtani hisobingizdan uzasizmi?</h2>
          <div id={descriptionId} className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p className="break-all font-semibold text-foreground">{email}</p>
            <p>Bu pochta ro‘yxatingizdan olib tashlanadi va unga kirish huquqingiz yo‘qoladi.
              Pochta va xatlar o‘chirilmaydi. Qayta ulash uchun administratorga murojaat qilish kerak.</p>
            <p>Agar Konami yoki boshqa akkauntingiz shu manzilga bog‘langan bo‘lsa,
              avval o‘sha xizmatda email manzilini almashtiring.</p>
          </div>
          {error && <p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button ref={cancel} type="button" variant="ghost" size="sm" disabled={pending} onClick={dismiss}>
              Bekor
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={unlink}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Link2Off aria-hidden="true" />}
              {pending ? 'Uzilmoqda…' : 'Ha, uzish'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

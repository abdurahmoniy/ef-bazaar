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
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmationId = useId();
  // Registr va chetdagi bo'shliq hisobga olinmaydi: manzil registrga
  // sezgir emas, telefonda birinchi harf o'zi kattalashadi va nusxa
  // olishda bo'shliq yopishadi. Tasdiqning maqsadi aniqlik, imlo emas.
  const typedMatches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  useEffect(() => {
    if (!confirming) return;
    const modal = dialog.current;
    if (!modal) return;
    const previousOverflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = 'hidden';
    cancel.current?.focus();
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [confirming]);

  function dismiss() {
    if (inFlight.current) return;
    dialog.current?.close();
    setConfirming(false);
    // Terilgan matn qolib ketmasligi kerak: keyingi safar tugma
    // allaqachon ochiq turardi va tasdiq ma'nosini yo'qotardi.
    setTyped('');
    setError(null);
    trigger.current?.focus();
  }

  async function unlink() {
    if (inFlight.current || !typedMatches) return;
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
    <div className="min-w-0">
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
        <dialog
          ref={dialog}
          role="alertdialog"
          aria-modal="true"
          onCancel={(event) => {
            event.preventDefault();
            dismiss();
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right
              || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
          }}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          aria-busy={pending}
          className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 text-sm text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px] sm:p-6"
        >
          <h2 id={titleId} className="text-lg font-bold">Pochtani hisobdan uzish?</h2>
          <div id={descriptionId} className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p className="break-all rounded-lg bg-muted px-3 py-2 font-semibold text-foreground">{email}</p>
            <p>Pochtaga kirish huquqingiz yo‘qoladi: paroli darhol
              almashtiriladi. Xatlar saqlanadi, lekin buni o‘zingiz qaytara
              olmaysiz — qayta ulash uchun administrator kerak.</p>
            <p>Uzishdan oldin <b className="text-foreground">shu manzilga hech
              qanday KONAMI ID bog‘lanmaganiga ishonch hosil qiling</b>.
              Bog‘langan bo‘lsa, parol tiklash xati shu qutiga keladi va siz
              uni o‘qiy olmaysiz — o‘sha akkountni qaytarib bo‘lmaydi.</p>
            <label htmlFor={confirmationId} className="block pt-1 text-xs font-semibold text-foreground">
              Tasdiqlash uchun pochta manzilini yozing
            </label>
            <input
              id={confirmationId}
              type="email"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={pending}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={email}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
          </div>
          {error && <p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button ref={cancel} type="button" variant="ghost" size="sm" disabled={pending} onClick={dismiss}>
              Bekor
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={pending || !typedMatches} onClick={unlink}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Link2Off aria-hidden="true" />}
              {pending ? 'Uzilmoqda…' : 'Ha, uzish'}
            </Button>
          </div>
        </dialog>
      )}
    </div>
  );
}

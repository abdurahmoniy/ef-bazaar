'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import type { PushState } from '@/lib/firebase-push';

interface Props {
  userId: string | null;
  state: PushState;
  busy: boolean;
  enable: () => void;
}

function dismissalKey(userId: string, mode: string) {
  return `efbazaar.push-prompt:${userId}:${mode}`;
}

export function dismissPushInvitation(userId: string) {
  try { localStorage.setItem(dismissalKey(userId, 'available'), 'dismissed'); } catch { /* Storage may be unavailable. */ }
}

export function PushPermissionPrompt(props: Props) {
  if (!props.userId || !['available', 'install', 'unsupported', 'error'].includes(props.state)) return null;
  const mode = props.state === 'error' ? 'available' : props.state;
  return <Invitation key={`${props.userId}:${mode}`} {...props} userId={props.userId} mode={mode} />;
}

function Invitation({ userId, state, mode, busy, enable }: Props & { userId: string; mode: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissalKey(userId, mode)) === 'dismissed'; } catch { return false; }
  });
  const [attempted, setAttempted] = useState(false);
  if (dismissed || (state === 'error' && !attempted)) return null;

  function dismiss() {
    try { localStorage.setItem(dismissalKey(userId, mode), 'dismissed'); } catch { /* Still dismiss for this visit. */ }
    setDismissed(true);
  }

  const description = state === 'install'
    ? 'iPhone yoki iPad’da saytni Safari’da oching, “Bosh ekranga qo‘shish” orqali o‘rnating va bosh ekrandan oching.'
    : state === 'unsupported'
      ? 'Bu brauzer push bildirishnomalarini qo‘llamaydi. Saytni Chrome yoki boshqa mos brauzerda oching.'
      : state === 'error'
        ? 'Ulanib bo‘lmadi. Bildirishnoma sozlamalarida qayta urinib ko‘ring.'
        : 'Yangi xabar va savdo yangiliklarini sayt yopiq bo‘lsa ham shu qurilmada oling.';

  return (
    <aside aria-label="Bildirishnomalarni yoqish taklifi" className="fixed bottom-[calc(var(--marketplace-bottom-bar-height,4.5rem)+0.75rem)] left-4 right-4 z-50 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-lg sm:bottom-6 sm:left-auto sm:right-6 sm:w-96">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Bell aria-hidden className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">Bildirishnomalarni yoqing</h2>
          <p role="status" className="mt-1 text-xs leading-relaxed text-muted-foreground">{busy ? 'Sozlamalar saqlanmoqda…' : description}</p>
        </div>
        <button type="button" aria-label="Taklifni yopish" onClick={dismiss} className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden className="h-4 w-4" /></button>
      </div>
      {state === 'available' && <button data-enable-push type="button" disabled={busy} onClick={() => { setAttempted(true); enable(); }} className="mt-3 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{busy ? 'Yoqilmoqda…' : 'Bildirishnomalarni yoqish'}</button>}
      <Link href="/notifications" onClick={dismiss} className="mt-2 flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Bildirishnoma sozlamalari</Link>
    </aside>
  );
}

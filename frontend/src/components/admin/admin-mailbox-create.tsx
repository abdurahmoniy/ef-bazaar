'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MailPlus, X } from 'lucide-react';

import { createMailboxAction } from '@/app/admin/mailboxes/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { avatarTone, partnerInitial } from '@/lib/chat-format';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AdminMailboxCreateProps {
  /** Candidates for the owner dropdown — newest users first. */
  users: User[];
  /**
   * When the list is filtered by owner the form is bound to that user and the
   * picker disappears: the admin already said whose mailbox this is.
   */
  lockedOwner?: User | null;
  lockedOwnerId?: string;
  mailDomain: string;
  /** Every domain the admin may pick, default first; one entry hides the picker. */
  mailDomains?: string[];
}

export function AdminMailboxCreate({
  users,
  lockedOwner,
  lockedOwnerId,
  mailDomain,
  mailDomains,
}: AdminMailboxCreateProps) {
  const domains = mailDomains && mailDomains.length > 0 ? mailDomains : [mailDomain];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [localPart, setLocalPart] = useState('');
  const [ownerUserId, setOwnerUserId] = useState(lockedOwnerId ?? '');
  const [domain, setDomain] = useState(domains[0]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Escape closes, and the body stops scrolling behind the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, isPending]);

  const owner = lockedOwner ?? users.find((u) => u.id === ownerUserId) ?? null;
  const normalized = localPart.trim().toLowerCase();
  const canSubmit = normalized.length >= 3 && Boolean(ownerUserId) && !isPending;

  function submit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await createMailboxAction({ localPart, ownerUserId, domain });
      if (!result.ok) {
        setError(result.error ?? 'Pochta yaratilmadi');
        return;
      }
      setNotice(`${result.mailbox?.email} yaratildi — Mailcow tasdiqlashi kutilmoqda.`);
      setLocalPart('');
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <MailPlus className="mr-1.5 h-4 w-4" />
        Yangi pochta
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" disabled>
        <MailPlus className="mr-1.5 h-4 w-4" />
        Yangi pochta
      </Button>

      <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 backdrop-blur-sm sm:items-center">
        <button
          type="button"
          aria-label="Yopish"
          className="absolute inset-0 cursor-default"
          onClick={() => !isPending && setOpen(false)}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Yangi pochta ro'yxatdan o'tkazish"
          className="relative w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-5 shadow-xl"
        >
          <header className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-black">Yangi pochta</h2>
              <p className="text-sm text-muted-foreground">
                Mailcow&apos;da quti ochiladi va tanlangan foydalanuvchiga biriktiriladi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => !isPending && setOpen(false)}
              className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Manzil
              </span>
              <span className="flex items-center gap-0">
                <Input
                  value={localPart}
                  onChange={(event) => setLocalPart(event.target.value)}
                  placeholder="azizbek"
                  className="rounded-r-none font-mono"
                  autoComplete="off"
                  autoFocus
                />
                {domains.length > 1 ? (
                  <select
                    aria-label="Domen"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                    className="h-10 rounded-r-lg border border-l-0 border-border bg-muted px-2 font-mono text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {domains.map((d) => (
                      <option key={d} value={d}>
                        @{d}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="flex h-10 items-center rounded-r-lg border border-l-0 border-border bg-muted px-3 font-mono text-sm font-semibold text-muted-foreground">
                    @{domain}
                  </span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground">
                Kichik harf, raqam, nuqta, tire — kamida 3 ta belgi.
              </span>
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Egasi
              </span>
              {lockedOwner ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black',
                      avatarTone(lockedOwner.id),
                    )}
                  >
                    {partnerInitial(lockedOwner.displayName)}
                  </span>
                  <span className="truncate text-sm font-bold">{lockedOwner.displayName}</span>
                </div>
              ) : (
                <>
                  <select
                    value={ownerUserId}
                    onChange={(event) => setOwnerUserId(event.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none transition focus:border-primary"
                  >
                    <option value="">Foydalanuvchini tanlang…</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName}
                        {user.email ? ` · ${user.email}` : ''}
                      </option>
                    ))}
                  </select>
                  <span className="block text-xs text-muted-foreground">
                    Ro&apos;yxatda yo&apos;q bo&apos;lsa — Foydalanuvchilar bo&apos;limida
                    &quot;Pochtalari&quot; tugmasini bosing.
                  </span>
                </>
              )}
            </div>

            {normalized.length >= 3 && owner && (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold">
                <span className="font-mono">
                  {normalized}@{mailDomain}
                </span>{' '}
                → {owner.displayName}
              </p>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            {notice && (
              <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {notice}
              </p>
            )}
          </div>

          <footer className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Bekor qilish
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Yaratish
            </Button>
          </footer>
        </div>
      </div>
    </>
  );
}

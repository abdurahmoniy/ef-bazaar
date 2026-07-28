'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { MailPlus } from 'lucide-react';

import { createMailboxAction } from '@/app/admin/mailboxes/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { User } from '@/lib/types';

interface AdminMailboxCreateProps {
  /** Candidates for the owner dropdown — newest users first. */
  users: User[];
  /**
   * When the list is filtered by owner the form is bound to that user and the
   * dropdown disappears: the admin already said whose mailbox this is.
   */
  lockedOwner?: User | null;
  lockedOwnerId?: string;
  mailDomain: string;
}

export function AdminMailboxCreate({
  users,
  lockedOwner,
  lockedOwnerId,
  mailDomain,
}: AdminMailboxCreateProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [localPart, setLocalPart] = useState('');
  const [ownerUserId, setOwnerUserId] = useState(lockedOwnerId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ownerLabel = lockedOwner
    ? lockedOwner.displayName
    : users.find((u) => u.id === ownerUserId)?.displayName;

  function submit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await createMailboxAction({ localPart, ownerUserId });
      if (!result.ok) {
        setError(result.error ?? 'Pochta yaratilmadi');
        return;
      }
      setNotice(
        `${result.mailbox?.email} yaratildi — Mailcow tasdiqlashi kutilmoqda (bir necha soniya).`,
      );
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
    <div className="w-full space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black">Yangi pochta ro&apos;yxatdan o&apos;tkazish</h2>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Yopish
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-bold text-muted-foreground">Manzil</span>
          <span className="flex items-center gap-1">
            <Input
              value={localPart}
              onChange={(event) => setLocalPart(event.target.value)}
              placeholder="masalan: azizbek"
              className="w-48"
              autoComplete="off"
            />
            <span className="text-sm font-semibold text-muted-foreground">@{mailDomain}</span>
          </span>
        </label>

        {lockedOwner ? (
          <p className="pb-2 text-sm font-semibold">
            Egasi: <span className="font-black">{lockedOwner.displayName}</span>
          </p>
        ) : (
          <label className="space-y-1">
            <span className="block text-xs font-bold text-muted-foreground">Foydalanuvchi</span>
            <select
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold"
            >
              <option value="">Tanlang…</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                  {user.email ? ` · ${user.email}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <Button
          size="sm"
          disabled={isPending || !localPart.trim() || !ownerUserId}
          onClick={submit}
        >
          {isPending ? 'Yaratilmoqda…' : 'Yaratish'}
        </Button>
      </div>

      {!lockedOwner && (
        <p className="text-xs font-semibold text-muted-foreground">
          Ro&apos;yxatda yo&apos;q foydalanuvchi uchun — Foydalanuvchilar bo&apos;limidan
          kerakli odamning &quot;Pochtalari&quot; tugmasini bosing.
        </p>
      )}

      {ownerLabel && localPart.trim() && (
        <p className="text-xs font-semibold text-muted-foreground">
          {localPart.trim().toLowerCase()}@{mailDomain} → {ownerLabel}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm font-semibold text-emerald-700">
          {notice}
        </p>
      )}
    </div>
  );
}

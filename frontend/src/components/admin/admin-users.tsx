'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search, ShieldCheck, ShieldOff, Trash2, UsersRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteUserAction, setUserRoleAction } from '@/app/admin/users/actions';
import { isAdmin } from '@/lib/admin';
import { formatListingDate } from '@/lib/marketplace-format';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AdminUsersProps {
  users: User[];
  search?: string;
  totalElements: number;
  /** Own row gets no mutation buttons — backend rejects self-targeting anyway. */
  currentUserId: string | null;
}

export function AdminUsers({ users, search, totalElements, currentUserId }: AdminUsersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function act(user: User, action: 'promote' | 'demote' | 'delete') {
    const confirmations: Record<typeof action, string> = {
      promote: `${user.displayName} admin qilinsinmi?`,
      demote: `${user.displayName} adminlikdan olinsinmi?`,
      delete: `${user.displayName} akkaunti butunlay o'chirilsinmi? Bu amalni qaytarib bo'lmaydi!`,
    };
    if (!window.confirm(confirmations[action])) return;

    setBusyId(user.id);
    setError(null);
    startTransition(async () => {
      const result =
        action === 'delete'
          ? await deleteUserAction(user.id)
          : await setUserRoleAction(user.id, action === 'promote' ? 'ADMIN' : 'USER');
      setBusyId(null);
      if (!result.ok) {
        setError(result.error ?? 'Amal bajarilmadi');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <form action="/admin/users" className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="search"
              defaultValue={search ?? ''}
              placeholder="Ism, username yoki email"
              className="w-64 pl-8"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Qidirish
          </Button>
        </form>
        <p className="text-sm font-semibold text-muted-foreground">Jami: {totalElements}</p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      {users.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <UsersRound className="h-8 w-8" />
          <p className="text-sm font-semibold">Foydalanuvchilar topilmadi</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {users.map((user) => {
            const admin = isAdmin(user);
            const self = user.id === currentUserId;
            const busy = isPending && busyId === user.id;
            return (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black">{user.displayName}</span>
                    {admin && (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-primary">
                        Admin
                      </span>
                    )}
                    {self && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-black uppercase tracking-wide text-muted-foreground">
                        Siz
                      </span>
                    )}
                    {user.verified && (
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-emerald-800">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {[
                      user.telegramUsername ? `@${user.telegramUsername}` : null,
                      user.email,
                      `ro'yxatdan o'tgan: ${formatListingDate(user.createdAt)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                {!self && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => act(user, admin ? 'demote' : 'promote')}
                    >
                      {admin ? (
                        <ShieldOff className="mr-1.5 h-4 w-4" />
                      ) : (
                        <ShieldCheck className="mr-1.5 h-4 w-4" />
                      )}
                      {admin ? 'Adminlikdan olish' : 'Admin qilish'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => act(user, 'delete')}
                      className={cn(busy && 'opacity-60')}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      O&apos;chirish
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

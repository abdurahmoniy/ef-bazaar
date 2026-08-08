'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Mail,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
  UserMinus,
  UsersRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OverflowMenu, overflowItemClass } from '@/components/navigation/overflow-menu';
import { deleteUserAction, setUserRoleAction } from '@/app/admin/users/actions';
import {
  adminUserActionConfig,
  adminUserBadges,
  type AdminUserMenuAction,
} from '@/lib/admin-user-actions';
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

  function act(user: User, action: AdminUserMenuAction) {
    const config = adminUserActionConfig(user, action);
    if (!window.confirm(config.confirmation)) return;

    setBusyId(user.id);
    setError(null);
    startTransition(async () => {
      const result =
        action === 'delete'
          ? await deleteUserAction(user.id)
          : await setUserRoleAction(user.id, config.role!);
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
            const self = user.id === currentUserId;
            const busy = isPending && busyId === user.id;
            const badges = adminUserBadges(user);
            const adminToggle = adminUserActionConfig(user, 'toggle-admin');
            const tradeAdminToggle = adminUserActionConfig(user, 'toggle-trade-admin');
            return (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black">{user.displayName}</span>
                    {badges.map((badge) => (
                      <span
                        key={badge}
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-black uppercase tracking-wide',
                          badge === 'Inson admin'
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200'
                            : 'bg-primary/10 text-primary',
                        )}
                      >
                        {badge}
                      </span>
                    ))}
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

                <div className="flex shrink-0 items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/mailboxes?ownerUserId=${user.id}`}>
                      <Mail className="mr-1.5 h-4 w-4" />
                      Pochtalari
                    </Link>
                  </Button>

                  {!self && (
                    <OverflowMenu label={`${user.displayName} amallari`}>
                      {(close) => (
                        <>
                          <MenuAction
                            action="toggle-admin"
                            user={user}
                            busy={busy}
                            icon={
                              adminToggle.role === 'USER' ? (
                                <ShieldOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                              )
                            }
                            onAct={() => {
                              close();
                              act(user, 'toggle-admin');
                            }}
                          />
                          <MenuAction
                            action="toggle-trade-admin"
                            user={user}
                            busy={busy}
                            icon={
                              tradeAdminToggle.role === 'USER' ? (
                                <UserMinus className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <UserCog className="h-4 w-4 text-muted-foreground" />
                              )
                            }
                            onAct={() => {
                              close();
                              act(user, 'toggle-trade-admin');
                            }}
                          />
                          <div className="my-1 h-px bg-border" />
                          <MenuAction
                            action="delete"
                            user={user}
                            busy={busy}
                            icon={<Trash2 className="h-4 w-4" />}
                            onAct={() => {
                              close();
                              act(user, 'delete');
                            }}
                          />
                        </>
                      )}
                    </OverflowMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MenuAction({
  user,
  action,
  busy,
  icon,
  onAct,
}: {
  user: User;
  action: AdminUserMenuAction;
  busy: boolean;
  icon: React.ReactNode;
  onAct: () => void;
}) {
  const config = adminUserActionConfig(user, action);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={busy}
      onClick={onAct}
      className={cn(
        overflowItemClass,
        config.destructive && 'text-destructive hover:bg-destructive/10',
        busy && 'cursor-not-allowed opacity-60',
      )}
    >
      {icon}
      {config.label}
    </button>
  );
}

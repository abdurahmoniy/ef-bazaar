import Link from 'next/link';
import { Mail, Search, ShieldCheck } from 'lucide-react';

import { AdminMailboxCreate } from '@/components/admin/admin-mailbox-create';
import { MailboxStatusBadge } from '@/components/admin/mailbox-status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatListingDate } from '@/lib/marketplace-format';
import type { AdminMailbox } from '@/lib/mailbox-admin-types';
import type { User } from '@/lib/types';

interface AdminMailboxesProps {
  mailboxes: AdminMailbox[];
  /** ownerUserId → user, resolved from auth-service. Missing = deleted user. */
  owners: Record<string, User>;
  search?: string;
  ownerUserId?: string;
  ownerUser: User | null;
  totalElements: number;
  /** Owner dropdown source for the create form. */
  selectableUsers: User[];
  mailDomain: string;
}

export function AdminMailboxes({
  mailboxes,
  owners,
  search,
  ownerUserId,
  ownerUser,
  totalElements,
  selectableUsers,
  mailDomain,
}: AdminMailboxesProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <form action="/admin/mailboxes" className="flex items-center gap-2">
          {ownerUserId && <input type="hidden" name="ownerUserId" value={ownerUserId} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="search"
              defaultValue={search ?? ''}
              placeholder="Pochta manzili"
              className="w-64 pl-8"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Qidirish
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-muted-foreground">Jami: {totalElements}</p>
          <AdminMailboxCreate
            users={selectableUsers}
            lockedOwner={ownerUser}
            lockedOwnerId={ownerUserId}
            mailDomain={mailDomain}
          />
        </div>
      </div>

      {ownerUserId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="text-sm font-semibold">
            <ShieldCheck className="mr-1.5 inline h-4 w-4 text-primary" />
            {ownerUser
              ? `${ownerUser.displayName} pochtalari`
              : "O'chirilgan foydalanuvchi pochtalari"}
          </p>
          <Link
            href="/admin/mailboxes"
            className="text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            Filtrni olib tashlash
          </Link>
        </div>
      )}

      {mailboxes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <Mail className="h-8 w-8" />
          <p className="text-sm font-semibold">Pochta topilmadi</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {mailboxes.map((mailbox) => {
            const owner = mailbox.ownerUserId ? owners[mailbox.ownerUserId] : undefined;
            return (
              <li key={mailbox.id}>
                <Link
                  href={`/admin/mailboxes/${mailbox.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition hover:border-primary/50"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black">{mailbox.email}</span>
                      <MailboxStatusBadge mailbox={mailbox} />
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {[
                        mailbox.ownerUserId
                          ? `egasi: ${owner?.displayName ?? "o'chirilgan foydalanuvchi"}`
                          : 'egasi yo‘q',
                        `yaratilgan: ${formatListingDate(mailbox.createdAt)}`,
                        mailbox.tradeId ? `savdo: ${mailbox.tradeId.slice(0, 8)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-primary">Batafsil →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

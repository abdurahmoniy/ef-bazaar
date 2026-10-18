'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';

import { searchMailboxUsersAction, type MailboxUserOption } from '@/app/admin/mailboxes/actions';
import { Input } from '@/components/ui/input';
import { avatarTone, partnerInitial } from '@/lib/chat-format';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MailboxOwnerPickerProps {
  /** Shown before anything is typed — the newest users. */
  initialUsers: User[];
  value: string;
  onChange: (id: string, user: MailboxUserOption) => void;
}

const toOption = (u: User): MailboxUserOption => ({
  id: u.id,
  displayName: u.displayName,
  telegramUsername: u.telegramUsername ?? null,
  email: u.email ?? null,
});

/**
 * Who gets the new mailbox. Searches every user on the server — name and
 * surname together, @username, the linked Google email or an id — instead of
 * only the newest few the page loaded.
 */
export function MailboxOwnerPicker({ initialUsers, value, onChange }: MailboxOwnerPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MailboxUserOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      searchMailboxUsersAction(q)
        .then((found) => {
          if (ticket === latest.current) setResults(found);
        })
        .catch(() => {
          if (ticket === latest.current) setResults([]);
        })
        .finally(() => {
          if (ticket === latest.current) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const shown = results ?? initialUsers.map(toOption);

  return (
    <div className="space-y-2">
      <label className="relative block">
        <span className="sr-only">Foydalanuvchini qidirish</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ism familiya, @username yoki email"
          className="pl-9"
          autoComplete="off"
        />
        {searching && (
          <Loader2 aria-hidden className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </label>

      <div role="listbox" aria-label="Foydalanuvchilar" className="max-h-56 overflow-y-auto rounded-lg border border-border">
        {shown.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            {results ? 'Hech kim topilmadi' : 'Foydalanuvchilar yo‘q'}
          </p>
        ) : (
          shown.map((u) => {
            const selected = u.id === value;
            return (
              <div
                key={u.id}
                role="option"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => onChange(u.id, u)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChange(u.id, u);
                  }
                }}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 focus:outline-none focus-visible:bg-muted',
                  selected ? 'bg-muted' : 'hover:bg-muted/60',
                )}
              >
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black', avatarTone(u.id))}>
                  {partnerInitial(u.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{u.displayName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[u.telegramUsername ? `@${u.telegramUsername}` : null, u.email].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                {selected && <Check aria-hidden className="h-4 w-4 shrink-0 text-primary dark:text-foreground" />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

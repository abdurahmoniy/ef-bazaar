'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { Package2, Plus, Search } from 'lucide-react';

import { AccountCard } from '@/components/profile/account-card';
import { PublishAccountDialog } from '@/components/profile/publish-account-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AccountDisplayData, UserAccountResponse } from '@/lib/accounts-types';

type AccountFilter = 'all' | 'market' | 'unlisted' | 'archived';
const FILTERS: { id: AccountFilter; label: string }[] = [
  { id: 'all', label: 'Barchasi' },
  { id: 'market', label: 'Bozorda' },
  { id: 'unlisted', label: 'Bozorda emas' },
  { id: 'archived', label: 'Arxivda' },
];

function matchesFilter(account: UserAccountResponse, filter: AccountFilter) {
  if (filter === 'market') return account.onMarket;
  if (filter === 'unlisted') return !account.onMarket && account.status !== 'ARCHIVED';
  if (filter === 'archived') return account.status === 'ARCHIVED';
  return true;
}

/**
 * "Akkountlarim" tabi.
 *
 * <p>Bozorga chiqarish oynasi shu yerda yashaydi, kartochkada emas:
 * bir vaqtda bitta oyna ochilishi kerak va uni ro'yxat egallaydi.
 */
export function ProfileAccounts({ accounts, displayById = {}, viewerId }: {
  accounts: UserAccountResponse[];
  displayById?: Record<string, AccountDisplayData>;
  viewerId: string;
}) {
  const [publishing, setPublishing] = useState<UserAccountResponse | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [storageNotice, setStorageNotice] = useState('');
  const searchId = useId();
  const viewKey = `accounts-view:${viewerId}`;
  const pinsKey = `accounts-pins:${viewerId}`;
  const showControls = accounts.length >= 5;

  useEffect(() => {
    setQuery('');
    setFilter('all');
    setPinnedIds([]);
    try {
      const view = JSON.parse(sessionStorage.getItem(viewKey) ?? 'null');
      if (typeof view?.query === 'string') setQuery(view.query);
      if (FILTERS.some((item) => item.id === view?.filter)) setFilter(view.filter);
      const pins: unknown = JSON.parse(localStorage.getItem(pinsKey) ?? '[]');
      if (Array.isArray(pins)) setPinnedIds(pins.filter((id): id is string => typeof id === 'string'));
    } catch {
      // Unavailable browser storage must not block account management.
    }
  }, [viewKey, pinsKey]);

  function changeView(nextQuery: string, nextFilter: AccountFilter) {
    setQuery(nextQuery);
    setFilter(nextFilter);
    try {
      sessionStorage.setItem(viewKey, JSON.stringify({ query: nextQuery, filter: nextFilter }));
    } catch {
      // The controls still work for this visit.
    }
  }

  function togglePin(id: string) {
    const next = pinnedIds.includes(id) ? pinnedIds.filter((entry) => entry !== id) : [...pinnedIds, id];
    setPinnedIds(next);
    setStorageNotice('');
    try {
      localStorage.setItem(pinsKey, JSON.stringify(next));
    } catch {
      setStorageNotice('Mahkamlash faqat shu tashrif davomida saqlanadi.');
    }
  }

  const visibleAccounts = accounts
    .filter((account) => !showControls || (matchesFilter(account, filter)
      && (account.title?.trim() || 'Nomsiz akkount').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    .sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id)));

  if (accounts.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card px-4 py-16 text-center shadow-xs">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-muted/50 text-muted-foreground ring-1 ring-border/50">
          <Package2 className="h-8 w-8 opacity-60" />
        </div>
        <h2 className="mt-3 text-base font-bold text-foreground">Sizda hali akkount yo&apos;q</h2>
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Akkountingizni bir marta to&apos;ldiring — keyin uni istagan vaqtingizda bozorga
          chiqarasiz va qaytarib olasiz.
        </p>
        <Button asChild className="mt-4 min-h-11 rounded-full px-5 font-semibold shadow-xs">
          <Link href="/profile/accounts/new">
            <Plus className="h-4 w-4" /> Akkount qo&apos;shish
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showControls && (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <label htmlFor={searchId} className="sr-only">Akkount nomi bo‘yicha qidirish</label>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input id={searchId} type="search" placeholder="Akkount nomi bo‘yicha qidirish" value={query}
              onChange={(event) => changeView(event.target.value, filter)} className="pl-10" />
          </div>
          <div role="group" aria-label="Akkount holati" className="flex flex-wrap gap-2">
            {FILTERS.filter((item) => item.id !== 'archived' || accounts.some((account) => account.status === 'ARCHIVED')).map((item) => (
              <Button key={item.id} type="button" variant={filter === item.id ? 'default' : 'outline'}
                className="min-h-11 rounded-full px-3" aria-pressed={filter === item.id} onClick={() => changeView(query, item.id)}>
                {item.label}<span className="text-xs opacity-75">{accounts.filter((account) => matchesFilter(account, item.id)).length}</span>
              </Button>
            ))}
          </div>
          <p role="status" className="text-xs text-muted-foreground">{visibleAccounts.length} ta akkount</p>
        </div>
      )}
      {storageNotice && <p role="status" className="text-sm text-muted-foreground">{storageNotice}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleAccounts.map((account) => (
          <AccountCard key={account.id} account={account} display={displayById[account.id]} onPublish={setPublishing}
            pinned={pinnedIds.includes(account.id)} onTogglePin={accounts.length > 1 ? () => togglePin(account.id) : undefined} />
        ))}
      </div>
      {visibleAccounts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <h2 className="font-semibold">Akkount topilmadi</h2>
          <p className="mt-1 text-sm text-muted-foreground">Qidiruvni yoki holat filtrini o‘zgartiring.</p>
          <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={() => changeView('', 'all')}>Tozalash</Button>
        </div>
      )}

      {publishing && (
        <PublishAccountDialog account={publishing} onClose={() => setPublishing(null)} />
      )}
    </div>
  );
}

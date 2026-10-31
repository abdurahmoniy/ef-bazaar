'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Package2, Plus, Search } from 'lucide-react';

import { CompletionNotice } from '@/components/marketplace/completion-notice';
import { AccountCard } from '@/components/profile/account-card';
import { PublishAccountDialog } from '@/components/profile/publish-account-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { accountDetailsIncomplete } from '@/lib/account-completeness';
import type { AccountDisplayData, UserAccountResponse } from '@/lib/accounts-types';

type AccountFilter = 'all' | 'market' | 'unlisted' | 'archived';
const FILTERS: { id: AccountFilter; label: string }[] = [
  { id: 'all', label: 'Barchasi' },
  { id: 'market', label: 'Bozorda' },
  { id: 'unlisted', label: 'Bozorda emas' },
  { id: 'archived', label: 'Sotilgan' },
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
export function ProfileAccounts({ accounts, displayById = {}, viewerId, savedAccountId }: {
  accounts: UserAccountResponse[];
  displayById?: Record<string, AccountDisplayData>;
  viewerId: string;
  savedAccountId?: string;
}) {
  const desktop = useMediaQuery('(min-width: 768px)');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedFilterRef = useRef<HTMLButtonElement>(null);
  const savedAccount = accounts.find((account) => account.id === savedAccountId);
  const savedCard = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState(true);
  const [publishing, setPublishing] = useState<UserAccountResponse | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [storageNotice, setStorageNotice] = useState('');
  const searchId = useId();
  const viewKey = `accounts-view:${viewerId}`;
  const pinsKey = `accounts-pins:${viewerId}`;
  const showSearch = accounts.length >= 5;
  const showControls = !desktop || showSearch;

  useEffect(() => {
    if (searchOpen && !desktop) searchRef.current?.focus();
  }, [searchOpen, desktop]);

  useEffect(() => {
    selectedFilterRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [filter, desktop]);

  useEffect(() => {
    setQuery('');
    setFilter('all');
    setPinnedIds([]);
    try {
      const view = JSON.parse(sessionStorage.getItem(viewKey) ?? 'null');
      if (!savedAccount && typeof view?.query === 'string') setQuery(view.query);
      if (!savedAccount && FILTERS.some((item) => item.id === view?.filter)) setFilter(view.filter);
      const pins: unknown = JSON.parse(localStorage.getItem(pinsKey) ?? '[]');
      if (Array.isArray(pins)) setPinnedIds(pins.filter((id): id is string => typeof id === 'string'));
    } catch {
      // Unavailable browser storage must not block account management.
    }
    if (savedAccount) {
      setHighlighted(true);
      savedCard.current?.focus({ preventScroll: true });
      savedCard.current?.scrollIntoView?.({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      try { sessionStorage.removeItem(viewKey); } catch { /* Browsing still works without storage. */ }
    }
  }, [viewKey, pinsKey, savedAccount]);

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
    .sort((a, b) => Number(b.id === savedAccountId) - Number(a.id === savedAccountId) || Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id)));

  const sellerTools = <Button asChild variant="outline" className="min-h-11"><Link href="/seller-tools">Sotuvchi vositalari</Link></Button>;

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
      {desktop && sellerTools}
      {savedAccount && <CompletionNotice key={savedAccount.id} title="Akkount saqlandi" description={savedAccount.onMarket ? 'O‘zgarishlar saqlandi. Akkountingiz bozorda.' : savedAccount.status === 'ARCHIVED' ? 'O‘zgarishlar saqlandi. Akkount arxivda.' : 'Hali bozorga chiqarilmagan. Tayyor bo‘lganda sotuvga qo‘yishingiz mumkin.'} queryKey="saved" focusOnMount={false} onDismiss={() => setHighlighted(false)}>
        <p className="mb-3 break-words text-sm font-semibold">{savedAccount.title?.trim() || 'Nomsiz akkount'}</p>
        {savedAccount.onMarket && savedAccount.currentListingId ? <Button asChild className="min-h-11"><Link href={`/marketplace/${savedAccount.currentListingId}`}>E’lonni ko‘rish</Link></Button>
          : savedAccount.status !== 'ARCHIVED' && (accountDetailsIncomplete(savedAccount) ? <Button asChild className="min-h-11"><Link href={`/profile/accounts/${encodeURIComponent(savedAccount.id)}`}>Ma’lumotlarni to‘ldirish</Link></Button> : <Button className="min-h-11" onClick={() => setPublishing(savedAccount)}>Bozorga chiqarish</Button>)}
      </CompletionNotice>}
      {showControls && (
        <div className="space-y-3">
          {(desktop || searchOpen || query.length > 0) && <div className="relative max-w-md">
            <label htmlFor={searchId} className="sr-only">Akkount nomi bo‘yicha qidirish</label>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input ref={searchRef} id={searchId} type="search" placeholder="Akkount nomi bo‘yicha qidirish" value={query}
              onChange={(event) => changeView(event.target.value, filter)} className="pl-10" />
          </div>}
          <div className="flex min-w-0 items-center gap-2 border-b border-border/60">
            <div role="group" aria-label="Akkount holati" className="no-scrollbar flex min-w-0 max-w-full items-center gap-2 overflow-x-auto">
              {FILTERS.filter((item) => !desktop || item.id !== 'archived' || accounts.some((account) => account.status === 'ARCHIVED')).map((item) => (
                <button key={item.id} ref={filter === item.id ? selectedFilterRef : undefined} type="button"
                  className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    filter === item.id ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                  aria-pressed={filter === item.id} onClick={() => changeView(query, item.id)}>
                  {item.label}<span className="font-normal tabular-nums text-muted-foreground">{accounts.filter((account) => matchesFilter(account, item.id)).length}</span>
                </button>
              ))}
            </div>
            {!desktop && showSearch && <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground"
              aria-label="Akkount qidirish" aria-expanded={searchOpen || query.length > 0} aria-controls={searchId}
              onClick={() => { const open = !(searchOpen || query.length > 0); setSearchOpen(open); if (!open) changeView('', filter); }}>
              <Search aria-hidden className="h-4 w-4" />
            </Button>}
          </div>
          <p role="status" className={desktop ? 'text-xs text-muted-foreground' : 'sr-only'}>{visibleAccounts.length} ta akkount</p>
        </div>
      )}
      {storageNotice && <p role="status" className="text-sm text-muted-foreground">{storageNotice}</p>}
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleAccounts.map((account) => (
          <div key={account.id} ref={account.id === savedAccountId ? savedCard : undefined} tabIndex={account.id === savedAccountId ? -1 : undefined}
            aria-label={account.id === savedAccountId ? 'Saqlangan akkount' : undefined}
            className={account.id === savedAccountId && highlighted ? 'rounded-2xl ring-2 ring-success-border ring-offset-2 ring-offset-background scroll-mt-24' : 'min-w-0'}>
            <AccountCard account={account} display={displayById[account.id]} onPublish={setPublishing}
              pinned={pinnedIds.includes(account.id)} onTogglePin={accounts.length > 1 ? () => togglePin(account.id) : undefined} />
          </div>
        ))}
      </div>
      {visibleAccounts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <h2 className="font-semibold">Akkount topilmadi</h2>
          <p className="mt-1 text-sm text-muted-foreground">Qidiruvni yoki holat filtrini o‘zgartiring.</p>
          <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={() => changeView('', 'all')}>Tozalash</Button>
        </div>
      )}

      {!desktop && sellerTools}
      {publishing && (
        <PublishAccountDialog account={publishing} onClose={() => setPublishing(null)} />
      )}
    </div>
  );
}

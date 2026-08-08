'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2, Search } from 'lucide-react';

import { TradeAdminCard } from '@/components/trade-admin/trade-admin-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { buildTradeApiPath } from '@/lib/trade-client-api';
import type { TradeAdminCardResponse, TradeAdminSort } from '@/lib/trade-types';
import { cn } from '@/lib/utils';

const SORT_OPTIONS: Array<{ value: TradeAdminSort; label: string }> = [
  { value: 'DEFAULT', label: 'Tavsiya' },
  { value: 'RATING', label: 'Reyting' },
  { value: 'FEE_ASC', label: 'Arzonroq' },
];

export function TradeAdminPicker({
  value,
  onSelect,
  className,
}: {
  value?: string;
  onSelect: (admin: TradeAdminCardResponse) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TradeAdminSort>('DEFAULT');
  const [admins, setAdmins] = useState<TradeAdminCardResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ sort });
    if (query.trim()) params.set('q', query.trim());

    startTransition(async () => {
      setError(null);
      const result = await fetchAdmins(params);
      if (cancelled) return;
      if (!result.ok) {
        setAdmins([]);
        setError(result.error);
        return;
      }
      setAdmins(result.data);
    });

    return () => {
      cancelled = true;
    };
  }, [query, sort]);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="grid gap-2 sm:grid-cols-[1fr,150px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Admin ismi"
            className="pl-9"
          />
        </div>
        <Select value={sort} onChange={(event) => setSort(event.target.value as TradeAdminSort)}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      {admins === null || pending ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Adminlar yuklanmoqda...
        </div>
      ) : admins.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          Admin topilmadi.
        </div>
      ) : (
        <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
          {admins.map((admin) => (
            <TradeAdminCard
              key={admin.userId}
              admin={admin}
              selected={admin.userId === value}
              compact
              action={
                <Button
                  type="button"
                  size="sm"
                  variant={admin.userId === value ? 'secondary' : 'outline'}
                  className="w-full"
                  disabled={admin.busy}
                  onClick={() => onSelect(admin)}
                >
                  {admin.userId === value ? 'Tanlangan' : 'Tanlash'}
                </Button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

async function fetchAdmins(
  params: URLSearchParams,
): Promise<{ ok: true; data: TradeAdminCardResponse[] } | { ok: false; error: string }> {
  try {
    const response = await fetch(buildTradeApiPath('v1/trade-admins', params), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return { ok: false, error: "Adminlar ro'yxati yuklanmadi" };
    return { ok: true, data: (await response.json()) as TradeAdminCardResponse[] };
  } catch {
    return { ok: false, error: "Adminlar ro'yxati yuklanmadi" };
  }
}

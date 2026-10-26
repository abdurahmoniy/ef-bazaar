'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  bindFeature, disconnectAccount, listAccounts, listFeatures,
} from '@/lib/userbot-client';
import type { UserbotAccount, UserbotFeature } from '@/lib/userbot-types';
import { sortAccounts, summarize } from '@/lib/userbot-view';
import { UserbotAccountCard } from './userbot-account-card';
import { UserbotFeatureRow } from './userbot-feature-row';
import { UserbotLoginDialog } from './userbot-login-dialog';

const POLL_MS = 15_000;
const TICK_MS = 5_000;
const TOAST_MS = 4_000;

interface UserbotPanelProps {
  initialAccounts: UserbotAccount[];
  initialFeatures: UserbotFeature[];
}

export function UserbotPanel({ initialAccounts, initialFeatures }: UserbotPanelProps) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [features, setFeatures] = useState(initialFeatures);
  const [loginOpen, setLoginOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, f] = await Promise.all([listAccounts(), listFeatures()]);
      setAccounts(a);
      setFeatures(f);
      setStale(false);
    } catch {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    setNow(new Date());
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const tick = setInterval(() => setNow(new Date()), TICK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = summarize(accounts);
  const sorted = sortAccounts(accounts);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Admin panel › Integratsiyalar</p>
          <h1 className="mt-1 text-3xl font-black">Userbotlar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Telegram akkountlari orqali ishlaydigan vazifalarni boshqaring.
          </p>
          {stale && <p className="mt-1 text-xs text-muted-foreground">Yangilab bo&apos;lmadi</p>}
        </div>
        <Button type="button" onClick={() => setLoginOpen(true)}>
          <Plus aria-hidden="true" />
          Userbot ulash
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Umumiy ko'rinish">
        <Stat label="Ulangan userbotlar" value={stats.total} />
        <Stat label="Tirik" value={stats.alive} />
        <Stat label="E'tibor talab qiladi" value={stats.attention} warn={stats.attention > 0} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Vazifalar</h2>
        {features.map((f) => (
          <UserbotFeatureRow
            key={f.feature}
            feature={f}
            accounts={accounts}
            onBind={(id) => bindFeature(f.feature, id).then(refresh)}
          />
        ))}
        <p className="text-sm text-muted-foreground">
          Kanalga post va support avto-javob vazifalari keyingi bosqichda qo&apos;shiladi.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Ulangan akkountlar</h2>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="font-medium text-foreground">Hali userbot ulanmagan</p>
            <Button type="button" onClick={() => setLoginOpen(true)}>
              <Plus aria-hidden="true" />
              Userbot ulash
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((a) => (
              <UserbotAccountCard
                key={a.id}
                account={a}
                now={now}
                onDisconnect={(id) => disconnectAccount(id).then(refresh).then(() => setToast('Userbot uzildi'))}
                onReconnect={() => setLoginOpen(true)}
              />
            ))}
          </div>
        )}
      </section>

      <UserbotLoginDialog
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onConnected={() => { void refresh(); setToast('Userbot ulandi'); }}
      />

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-black ${warn ? 'text-warning' : ''}`}>{value}</p>
    </div>
  );
}

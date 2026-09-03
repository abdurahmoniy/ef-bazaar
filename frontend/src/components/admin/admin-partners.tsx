'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  Handshake,
  Loader2,
  Save,
  Users,
  XCircle,
} from 'lucide-react';

import { AdminPartnerAnalytics } from '@/components/admin/admin-partner-analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BADGE_PARTNER_APPLICATIONS,
  getAdminApplications,
  getAdminPartnerSettings,
  markSectionSeen,
  reviewApplication,
  updateAdminPartnerSettings,
  type PartnerApplication,
  type PartnerApplicationStatus,
  type PartnerSettings,
} from '@/lib/partners';
import { cn } from '@/lib/utils';

type TabId = 'applications' | 'settings' | 'analytics';

const STATUS_LABEL: Record<PartnerApplicationStatus, { label: string; className: string }> = {
  AWAITING_CHANNEL: { label: 'Kanal kutilmoqda', className: 'bg-muted text-muted-foreground' },
  AWAITING_PAYMENT: { label: "To'lov kutilmoqda", className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  AWAITING_REVIEW: { label: 'Ko‘rikda', className: 'bg-primary/15 text-primary' },
  APPROVED: { label: 'Tasdiqlangan', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  REJECTED: { label: 'Rad etilgan', className: 'bg-destructive/15 text-destructive' },
  CANCELLED: { label: 'Bekor qilingan', className: 'bg-muted text-muted-foreground' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function AdminPartners() {
  const [tab, setTab] = useState<TabId>('applications');

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Handshake className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Hamkorlar</h1>
          <p className="text-sm text-muted-foreground">
            Katta kanal egalarining hamkorlik arizalari va shartlari.
          </p>
        </div>
      </header>

      <nav className="overflow-x-auto no-scrollbar">
        <div className="flex min-w-max items-center gap-1 border-b border-border">
          {([
            { id: 'applications' as const, label: 'Arizalar' },
            { id: 'settings' as const, label: 'Shartlar' },
            { id: 'analytics' as const, label: 'Voronka' },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'border-b-2 px-3 py-2.5 text-sm font-semibold transition',
                tab === item.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'applications' && <Applications />}
      {tab === 'settings' && <Settings />}
      {tab === 'analytics' && <AdminPartnerAnalytics />}
    </div>
  );
}

function Applications() {
  const [items, setItems] = useState<PartnerApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await getAdminApplications();
      setItems(page.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Arizalar yuklanmadi');
    }
  }, []);

  useEffect(() => {
    load();
    // Ro'yxat ochildi — ishora o'chadi. Alohida chaqiruv: ro'yxatni o'qish
    // boshqa joydan ham bo'lishi mumkin va o'shanda ishora adminning
    // xabarisiz o'chib ketardi.
    markSectionSeen(BADGE_PARTNER_APPLICATIONS);
  }, [load]);

  async function review(id: string, outcome: 'approve' | 'reject' | 'cancel') {
    setError(null);
    setBusy(id);
    try {
      await reviewApplication(id, outcome);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Amal bajarilmadi');
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  if (items === null) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Hali birorta ariza yo&apos;q.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((a) => {
        const status = STATUS_LABEL[a.status];
        return (
          <article key={a.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', status.className)}>
                {status.label}
              </span>
              <time className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</time>
            </div>

            <div className="space-y-1 text-sm">
              <p className="font-semibold">{a.channelTitle ?? 'Kanal biriktirilmagan'}</p>
              {a.channelUsername && (
                <p className="text-xs text-muted-foreground">@{a.channelUsername}</p>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {a.subscriberCount == null ? '—' : `${a.subscriberCount} obunachi`}
              </p>
              {a.paidAt && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CreditCard className="h-3.5 w-3.5" />
                  To&apos;landi · {formatDate(a.paidAt)}
                </p>
              )}
              {a.verificationError && (
                <p className="text-xs text-destructive">{a.verificationError}</p>
              )}
            </div>

            {a.status === 'AWAITING_REVIEW' && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => review(a.id, 'approve')}
                  disabled={busy === a.id}
                  className="gap-2"
                >
                  {busy === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Tasdiqlash
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => review(a.id, 'reject')}
                  disabled={busy === a.id}
                  className="gap-2 text-destructive"
                >
                  <XCircle className="h-4 w-4" />
                  Rad etish
                </Button>
              </div>
            )}

            {/*
              Bekor qilish tasdiqlangandan KEYIN ham kerak: hamkorlik
              qoidabuzarlik yoki kelishuv bilan to'xtatilishi mumkin, va
              o'shanda rol ham qaytariladi.
            */}
            {a.status === 'APPROVED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => review(a.id, 'cancel')}
                disabled={busy === a.id}
                className="gap-2 text-destructive"
              >
                {busy === a.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                Hamkorlikni to&apos;xtatish
              </Button>
            )}

            {a.cancelReason && (
              <p className="text-xs text-muted-foreground">Sabab: {a.cancelReason}</p>
            )}

            {a.reviewedAt && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Ko&apos;rildi · {formatDate(a.reviewedAt)}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Settings() {
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [minSubscribers, setMinSubscribers] = useState('');
  const [priceSom, setPriceSom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAdminPartnerSettings()
      .then((s) => {
        setSettings(s);
        setMinSubscribers(String(s.minSubscribers));
        setPriceSom(String(s.priceSom));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Shartlar yuklanmadi'));
  }, []);

  async function save() {
    const min = Number(minSubscribers);
    const price = Number(priceSom);
    if (!Number.isFinite(min) || min < 0) {
      setError("Obunachi soni 0 dan kichik bo'lmasligi kerak");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Narx 0 dan kichik bo'lmasligi kerak");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await updateAdminPartnerSettings({ minSubscribers: min, priceSom: price });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saqlab bo‘lmadi');
    } finally {
      setSaving(false);
    }
  }

  if (!settings && !error) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-3 rounded-xl border border-border bg-card p-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {saved && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Shartlar saqlandi.</span>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="min-subs">Minimal obunachi soni</Label>
        <Input
          id="min-subs"
          inputMode="numeric"
          value={minSubscribers}
          onChange={(e) => setMinSubscribers(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Kanalda shundan kam obunachi bo&apos;lsa ariza tekshiruvdan o&apos;tmaydi.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="price">Hamkorlik narxi (so&apos;m)</Label>
        <Input
          id="price"
          inputMode="numeric"
          value={priceSom}
          onChange={(e) => setPriceSom(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Foydalanuvchining hamyonidan yechiladi. Mablag&apos; yetmasa unga
          yetishmayotgan summa ko&apos;rsatiladi.
        </p>
      </div>

      <Button onClick={save} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Saqlash
      </Button>
    </div>
  );
}

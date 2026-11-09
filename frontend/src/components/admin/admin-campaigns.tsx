'use client';

import { useEffect, useState } from 'react';
import { Archive, Check, Copy, Loader2, Megaphone, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { campaignLinks } from '@/lib/campaign-capture';
import {
  archiveCampaign,
  CAMPAIGN_KIND_LABELS,
  conversion,
  createCampaign,
  listCampaigns,
  type CampaignKind,
  type CampaignRow,
} from '@/lib/campaigns';
import { siteConfig } from '@/lib/site';

const BOT_USERNAME = siteConfig.links.telegramBot.replace('https://t.me/', '');

function CopyLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked (e.g. inside a webview); the link stays visible to copy by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={url}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium transition hover:bg-muted"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Nusxalandi' : label}
    </button>
  );
}

function Stage({ value, rate, label }: { value: number; rate?: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-base font-semibold tabular-nums">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">
        {label}
        {rate ? ` · ${rate}` : ''}
      </p>
    </div>
  );
}

function CampaignLine({ row, onArchive }: { row: CampaignRow; onArchive: (id: string) => void }) {
  const links = campaignLinks(row.code, siteConfig.url, BOT_USERNAME);
  const archived = row.archivedAt !== null;

  return (
    <li className={`space-y-3 border-b border-border px-4 py-3 last:border-0 ${archived ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {CAMPAIGN_KIND_LABELS[row.kind] ?? row.kind} · {row.code}
            {archived ? ' · to‘xtatilgan' : ''}
          </p>
        </div>
        {!archived && (
          <div className="flex flex-wrap gap-2">
            <CopyLink label="Sayt havolasi" url={links.site} />
            {links.bot && <CopyLink label="Bot havolasi" url={links.bot} />}
            <button
              type="button"
              onClick={() => onArchive(row.id)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition hover:bg-muted"
            >
              <Archive className="h-3.5 w-3.5" /> To‘xtatish
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Stage value={row.clicks} label="Bosish" />
        <Stage value={row.registrations} rate={conversion(row.registrations, row.clicks)} label="Ro‘yxatdan o‘tdi" />
        <Stage value={row.listed} rate={conversion(row.listed, row.registrations)} label="E’lon qo‘ydi" />
        <Stage value={row.sold} rate={conversion(row.sold, row.registrations)} label="Sotdi" />
      </div>
    </li>
  );
}

/**
 * Adminka "Kampaniyalar" bo'limi: har bir guruh posti yoki tarmoq uchun alohida
 * havola va uning voronkasi (bosish → ro'yxatdan o'tish → e'lon → sotuv).
 */
export function AdminCampaigns() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CampaignKind>('TELEGRAM_GROUP');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCampaigns()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Yuklanmadi'))
      .finally(() => setLoading(false));
  }, []);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Kampaniya nomini kiriting');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const created = await createCampaign(trimmed, kind);
      setRows((current) => [created, ...current]);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saqlanmadi');
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    setError(null);
    try {
      await archiveCampaign(id);
      const now = new Date().toISOString();
      setRows((current) => {
        const updated = current.map((r) => (r.id === id ? { ...r, archivedAt: now } : r));
        return [...updated.filter((r) => !r.archivedAt), ...updated.filter((r) => r.archivedAt)];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'To‘xtatilmadi');
    }
  }

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Kampaniyalar</h1>
          <p className="text-sm text-muted-foreground">
            Har bir guruh posti yoki tarmoq uchun alohida havola: qaysi manba odam va savdo olib kelayotgani.
          </p>
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Yangi havola</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Masalan: eFootball UZ guruhi, 10-noyabr posti"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-label="Kampaniya nomi"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CampaignKind)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-label="Manba turi"
          >
            {(Object.keys(CAMPAIGN_KIND_LABELS) as CampaignKind[]).map((k) => (
              <option key={k} value={k}>
                {CAMPAIGN_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <Button onClick={create} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Yaratish
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Faqat yangi ro‘yxatdan o‘tganlar hisoblanadi va har bir odam birinchi kelgan manbasida qoladi.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card">
        {loading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Hali kampaniya yo‘q. Birinchi havolani yuqorida yarating.</p>
        ) : (
          <ul>
            {rows.map((row) => (
              <CampaignLine key={row.id} row={row} onArchive={archive} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

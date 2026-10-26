'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  AtSign,
  Bot,
  CalendarDays,
  Instagram,
  ListChecks,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

import { ChannelAvatar } from '@/components/auth/access-required-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AccessApiError,
  addTelegramChannelRequirement,
  deleteAccessRequirement,
  getAdminAccessRequirements,
  type AccessRequirement,
} from '@/lib/access-requirements';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { cn } from '@/lib/utils';

type TabId = 'telegram' | 'instagram';

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function AdminAccessRequirements() {
  const [tab, setTab] = useState<TabId>('telegram');
  const [items, setItems] = useState<AccessRequirement[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await getAdminAccessRequirements());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Shartlar yuklanmadi');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const telegramChannels = (items ?? []).filter((item) => item.type === 'TELEGRAM_CHANNEL');

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <ListChecks className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Kirish shartlari</h1>
          <p className="text-sm text-muted-foreground">
            Foydalanuvchi platformaga kirishidan oldin bajarishi kerak bo&apos;lgan talablar.
          </p>
        </div>
      </header>

      <nav className="overflow-x-auto no-scrollbar">
        <div className="flex min-w-max items-center gap-1 border-b border-border">
          <TabButton active={tab === 'telegram'} onClick={() => setTab('telegram')}>
            <Send className="h-4 w-4" />
            Kanal a&apos;zolik tekshiruvi
            {items !== null && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {telegramChannels.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'instagram'} onClick={() => setTab('instagram')}>
            <Instagram className="h-4 w-4" />
            Instagram
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Tez orada
            </span>
          </TabButton>
        </div>
      </nav>

      {tab === 'telegram' && (
        <TelegramChannels
          items={items === null ? null : telegramChannels}
          loadError={loadError}
          onChanged={load}
        />
      )}
      {tab === 'instagram' && <ComingSoon />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition',
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function TelegramChannels({
  items,
  loadError,
  onChanged,
}: {
  items: AccessRequirement[] | null;
  loadError: string | null;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <HowItWorks />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Ulangan kanallar</h2>
          <p className="text-xs text-muted-foreground">
            Foydalanuvchi bu kanallarning HAR BIRIGA obuna bo&apos;lishi shart.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Kanal qo&apos;shish
        </Button>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {items === null && !loadError && (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-2xl border border-border bg-muted/40" />
          ))}
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Send className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Hali kanal ulanmagan</p>
            <p className="text-xs text-muted-foreground">Hozir hamma foydalanuvchi shartsiz kira oladi.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            Birinchi kanalni qo&apos;shish
          </Button>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <ChannelCard key={item.id} item={item} onDeleted={onChanged} />
          ))}
        </div>
      )}

      {adding && (
        <AddChannelDialog
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Bot, text: <>@{BOT_USERNAME} ni kanalga <b>admin</b> qilib qo&apos;shing</> },
    { icon: AtSign, text: <>Kanal username&apos;ini shu yerga kiriting</> },
    { icon: ShieldCheck, text: <>Obuna bo&apos;lmaganlar kira olmaydi — shartlar ekrani ochiladi</> },
  ];
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">Qanday ishlaydi</p>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-sm">
              <step.icon className="h-4 w-4" />
            </span>
            <span className="pt-1 leading-snug text-foreground/90">{step.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Adminlar tekshirilmaydi. Bot yoki servis vaqtincha ishlamasa tekshiruv o&apos;tkazib yuboriladi — hech kim
        nosozlik sababli bloklanmaydi.
      </p>
    </div>
  );
}

function ChannelCard({ item, onDeleted }: { item: AccessRequirement; onDeleted: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = item.title || (item.username ? `@${item.username}` : 'Kanal');

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccessRequirement(item.id);
      await onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Olib tashlab bo'lmadi");
      setBusy(false);
    }
  }

  return (
    <article className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
      <div className="flex items-center gap-3">
        <ChannelAvatar
          title={title}
          photo={item.photoFileId ? listingMediaUrl(item.photoFileId) : null}
          className="h-12 w-12"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
            >
              @{item.username}
              <ArrowUpRight className="h-3 w-3" />
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Username yo&apos;q</p>
          )}
        </div>
        {!confirming && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirming(true)}
            aria-label="Olib tashlash"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
          </Button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" />
        Ulangan: {formatDate(item.createdAt)}
      </div>

      {confirming && (
        <div className="mt-3 space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm">
            Kanal shartlardan olib tashlansinmi? Foydalanuvchilar unga obuna bo&apos;lmasdan kira oladi.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Olib tashlash
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Bekor qilish
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function AddChannelDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccessApiError | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addTelegramChannelRequirement(username.trim());
      await onAdded();
    } catch (err) {
      setError(err instanceof AccessApiError ? err : new AccessApiError("Kanal qo'shilmadi"));
      setBusy(false);
    }
  }

  const botNotAdmin = error?.code === 'BOT_NOT_CHANNEL_ADMIN';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-channel-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h3 id="add-channel-title" className="font-bold">
                Kanal qo&apos;shish
              </h3>
              <p className="text-xs text-muted-foreground">Bot kanalda admin ekani tekshiriladi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Yopish"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="channel-username">Kanal username</Label>
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="channel-username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="efbazaar yoki https://t.me/efbazaar"
                className="pl-9"
                disabled={busy}
                autoComplete="off"
              />
            </div>
            <p className="text-xs text-muted-foreground">Faqat ommaviy (public) kanallar — username bo&apos;lishi shart.</p>
          </div>

          {error && botNotAdmin && (
            <div className="space-y-2 rounded-xl border border-warning-border bg-warning-soft p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-warning">
                <Bot className="h-4 w-4" />
                Bot kanalga admin qilinmagan
              </p>
              <ol className="list-decimal space-y-0.5 pl-5 text-xs text-foreground/80">
                <li>Kanal sozlamalari → Administratorlar → Admin qo&apos;shish</li>
                <li>
                  <b>@{BOT_USERNAME}</b> ni qidirib toping va admin qiling
                </li>
                <li>Shu yerga qaytib, qayta &quot;Tekshirish va qo&apos;shish&quot; ni bosing</li>
              </ol>
            </div>
          )}

          {error && !botNotAdmin && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
              Bekor qilish
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || !username.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {busy ? 'Tekshirilmoqda…' : "Tekshirish va qo'shish"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400 text-white">
        <Instagram className="h-6 w-6" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold">Instagram obunasi — tez orada</p>
        <p className="text-xs text-muted-foreground">
          Instagram boshqa odamning obunasini tekshirishga ruxsat bermaydi, shuning uchun bu shart &quot;havolani ochib
          tasdiqlash&quot; ko&apos;rinishida qo&apos;shiladi.
        </p>
      </div>
    </div>
  );
}

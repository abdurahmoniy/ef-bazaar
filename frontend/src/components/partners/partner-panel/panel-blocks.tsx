'use client';

import { useCallback, useEffect, useState } from 'react';
import { Coins, Gift, Loader2, MousePointerClick, Save, Send, Settings2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { trackGrowth } from '@/lib/growth-analytics';
import { PostSettingsTab } from '@/components/partners/partner-panel/post-settings';
import { channelInitial, channelPhotoUrl } from '@/lib/partner-channels';
import {
  describeTerms,
  formatSom,
  getPartnerPanel,
  postStateLabel,
  isValidPostPrice,
  updatePostPrice,
  type PartnerPanel,
} from '@/lib/partner-panel';

/**
 * Hamkor panelining to'rt bloki (spec §7.3).
 *
 * <p>Daromad UCH OQIM bo'lib ko'rsatiladi. Ular boshqacha xatti-harakat
 * qiladi, va narxini tushiraymi degan qarorni qabul qilayotgan hamkor
 * qaysi oqim javob berayotganini ko'rishi kerak — bitta umumiy raqam
 * bu savolga javob bermaydi.
 */
export function PartnerPanelBlocks() {
  const [panel, setPanel] = useState<PartnerPanel | null>(null);
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [freePricing, setFreePricing] = useState(false);
  const [tab, setTab] = useState<'stats' | 'post'>('stats');

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getPartnerPanel();
      setPanel(data); setPrice(String(data.channel.postPriceSom));
    } catch (e) { setError(e instanceof Error ? e.message : 'Yuklanmadi'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function save() {
    if (!panel) return;
    const value = Number(price);
    if (!price.trim() || !isValidPostPrice(value)) {
      setError('To‘g‘ri narx kiriting. Narx manfiy bo‘lishi mumkin emas.');
      return;
    }
    if (value === 0 && !freePricing) {
      setError('Bepul joylashni tanlang yoki noldan katta narx kiriting.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await updatePostPrice(value);
      setPanel(updated);
      setPrice(String(updated.channel.postPriceSom));
      setSaved(true);
      trackGrowth('partnership_price_saved', { placement: 'partner_panel', state: value === 0 ? 'free' : 'paid' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saqlanmadi');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
      </div>
    );
  }

  if (!panel) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-border p-4 text-sm text-muted-foreground">
        <p>{error ?? 'Panel maʼlumotlari topilmadi.'}</p>
        <Button variant="outline" onClick={() => void refresh()}>Qayta urinish</Button>
      </div>
    );
  }

  const photo = channelPhotoUrl({ photoFileId: panel.channel.photoFileId });

  return (
    <>
      {/*
        Kanal eng boshida: hamkor panelga kirganda avval O'Z kanalini
        taniydi, keyin raqamlarni o'qiydi. Raqamlar avval kelsa, ular
        qaysi kanalniki ekani noaniq bo'lardi.
      */}
      <section className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
            {channelInitial(panel.channel.title)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{panel.channel.title}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {panel.channel.subscriberCount.toLocaleString('uz-UZ')} obunachi
            {panel.channel.username && ` · @${panel.channel.username}`}
          </p>
        </div>
      </section>

      {panel.channel.postPriceSom === 0 && (
        <section className="space-y-2 rounded-xl border border-warning-border bg-warning-soft p-4">
          <h2 className="text-sm font-semibold">Kanalingizga hozir bepul joylash mumkin</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">Amaldagi post narxi 0 so‘m. Pullik joylashni xohlasangiz narx belgilang, yoki bepul joylashni ongli ravishda tanlab saqlang.</p>
          <a href="#partner-post-price" onClick={() => setTab('stats')} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">Post narxini sozlash</a>
        </section>
      )}

      <nav className="flex gap-1 rounded-xl border border-border bg-card p-1" role="tablist">
        {([['stats', 'Statistika', Coins], ['post', 'Post ko‘rinishi', Settings2]] as const).map(
          ([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ),
        )}
      </nav>

      {tab === 'post' && (
        <PostSettingsTab
          settings={panel.postSettings}
          onSaved={(postSettings) => setPanel({ ...panel, postSettings })}
        />
      )}

      {tab === 'stats' && (
      <>
      {/* 1. Post narxi — chegaralar bilan birga */}
      <section id="partner-post-price" className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="h-4 w-4" />
          Kanalga e&apos;lon joylash narxi
        </h2>
        <p className="text-xs text-muted-foreground">
          Sotuvchi e&apos;lonini kanalingizda chiqarish uchun shuncha to&apos;laydi. Narxni
          o&apos;zingiz belgilaysiz. <strong>0</strong> — kanalingizga bepul joylanadi.
        </p>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <label htmlFor="partner-post-price-input" className="block text-sm font-medium">Post narxi (so‘m)</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="partner-post-price-input"
            type="number"
            min={0}
            value={price}
            onChange={(e) => { setPrice(e.target.value); setFreePricing(false); setSaved(false); }}
            aria-label="Post narxi (so'm)"
            className="min-h-11 w-36 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <span className="text-sm text-muted-foreground">so&apos;m</span>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saqlandi' : 'Saqlash'}
          </Button>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={freePricing} onChange={(e) => {
            setFreePricing(e.target.checked); setSaved(false);
            if (e.target.checked) setPrice('0');
          }} className="h-5 w-5 shrink-0 accent-primary" />
          Bepul joylashni tanlayman (0 so‘m)
        </label>
        {saved && <p role="status" className="text-sm text-success">Narx saqlandi.</p>}
      </section>

      {/* 2. Kanal voronkasi — shaxsiy taklif havolasi EMAS, u /invite da */}
      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MousePointerClick className="h-3.5 w-3.5" /> Kanaldan bosilishlar
          </p>
          <p className="text-lg font-bold">{panel.funnel.clicks.toLocaleString('uz-UZ')}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Ro&apos;yxatdan o&apos;tganlar
          </p>
          <p className="text-lg font-bold">{panel.funnel.registrations.toLocaleString('uz-UZ')}</p>
        </div>
      </section>

      {/* 3. Daromad — uch oqim alohida, ustida amaldagi shart */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gift className="h-4 w-4" />
          Daromad
        </h2>
        {/*
          Shartni KO'RSATAMIZ, lekin tahrirlash yo'q — uni admin
          sozlaydi. Ko'rsatmasak, hamkor "Savdodan" ustunidagi raqam
          qayerdan chiqqanini tushuntira olmasdi.
        */}
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Sizning shartingiz: <strong className="text-foreground">{describeTerms(panel.terms)}</strong>
          <br />
          Shartni platforma belgilaydi. E&apos;lon joylash haqi esa alohida va uni o&apos;zingiz
          qo&apos;yasiz.
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">E&apos;lon joylashdan</p>
            <p className="text-base font-bold">{formatSom(panel.earnings.fromPostsSom)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Savdodan</p>
            <p className="text-base font-bold">{formatSom(panel.earnings.fromTradesSom)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Oylik</p>
            <p className="text-base font-bold">{formatSom(panel.earnings.monthlySom)}</p>
          </div>
        </div>
      </section>

      {/* 4. Kanaldagi postlar */}
      <section className="rounded-xl border border-border bg-card">
        <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <Send className="h-4 w-4" />
          Kanalingizdagi e&apos;lonlar
        </h2>
        {panel.posts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Hali hech kim kanalingizga e&apos;lon joylamagan.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {panel.posts.map((post) => (
              <li key={post.postId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{postStateLabel(post.state)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(post.createdAt).toLocaleDateString('uz-UZ')}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatSom(post.priceSom)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}
    </>
  );
}

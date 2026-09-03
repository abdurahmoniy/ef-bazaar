'use client';

import { useEffect, useState } from 'react';
import { Coins, Gift, Loader2, MousePointerClick, Save, Send, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
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

  useEffect(() => {
    getPartnerPanel()
      .then((data) => {
        setPanel(data);
        setPrice(String(data.channel.postPriceSom));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Yuklanmadi'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!panel) return;
    const value = Number(price);
    if (!isValidPostPrice(value)) {
      setError("Narx manfiy bo'lishi mumkin emas");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await updatePostPrice(value);
      setPanel(updated);
      setPrice(String(updated.channel.postPriceSom));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
      <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        {error ?? 'Panel maʼlumotlari topilmadi.'}
      </p>
    );
  }

  return (
    <>
      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* 1. Post narxi — chegaralar bilan birga */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="h-4 w-4" />
          Kanalga e&apos;lon joylash narxi
        </h2>
        <p className="text-xs text-muted-foreground">
          Sotuvchi e&apos;lonini kanalingizda chiqarish uchun shuncha to&apos;laydi. Narxni
          o&apos;zingiz belgilaysiz. <strong>0</strong> — kanalingizga bepul joylanadi.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label="Post narxi (so'm)"
            className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <span className="text-sm text-muted-foreground">so&apos;m</span>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saqlandi' : 'Saqlash'}
          </Button>
        </div>
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

      {/* 3. Daromad — uch oqim alohida */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gift className="h-4 w-4" />
          Daromad
        </h2>
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
  );
}

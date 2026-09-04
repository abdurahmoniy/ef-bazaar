'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Megaphone, RotateCw } from 'lucide-react';

import { ChannelPicker } from '@/components/marketplace/channel-picker';
import { Button } from '@/components/ui/button';
import { formatSom } from '@/lib/partner-panel';
import {
  listPostedChannels,
  orderChannelPosts,
  postedAgo,
  type PostedChannel,
} from '@/lib/partner-channels';

interface Props {
  listingId: string;
}

/**
 * Mavjud e'lonni hamkor kanallariga joylash va QAYTA joylash.
 *
 * <p>Tahrirlash formasidan ATAYLAB ajratilgan. Forma "Saqlash" tugmasi
 * har tahrirda bosiladi; kanallar unga qo'shilsa, tavsifni tuzatgani
 * uchun hamyondan pul yechilib ketardi. Bu yerda esa pul faqat shu
 * bo'limning o'z tugmasidan harakat qiladi.
 *
 * <p>Yuqorida e'lon qayerlarda chiqqani turadi: kanalda e'lonlar tez
 * aylanadi va sotuvchi "qachon chiqqan edi" ni bilmasdan qayta
 * to'lashi qorong'ida qaror qabul qilish bo'lardi.
 */
export function ListingChannelPosts({ listingId }: Props) {
  const [posted, setPosted] = useState<PostedChannel[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    listPostedChannels(listingId)
      .then(setPosted)
      .catch((e) => setError(e instanceof Error ? e.message : 'Yuklanmadi'))
      .finally(() => setLoading(false));
  }, [listingId]);

  useEffect(reload, [reload]);

  async function send(channelIds: string[]) {
    if (channelIds.length === 0 || sending) return;
    setError(null);
    setDone(false);
    setSending(true);
    try {
      await orderChannelPosts(listingId, channelIds);
      setSelected([]);
      setDone(true);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Joylab bo‘lmadi');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-4">
      {posted.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Megaphone className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Chiqqan kanallar</h2>
              <p className="text-xs text-muted-foreground">
                Kanalda e&apos;lonlar tez aylanadi. Qayta yuborsangiz e&apos;lon
                yana yuqoriga chiqadi, eskisi esa kanaldan olinadi.
              </p>
            </div>
          </div>

          <ul className="divide-y divide-border">
            {posted.map((channel) => (
              <li key={channel.channelId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{channel.channelTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {postedAgo(channel.lastPostedAt)}
                    {channel.postedCount > 1 && ` · ${channel.postedCount} marta`}
                  </p>
                </div>
                {channel.channelActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={sending}
                    onClick={() => send([channel.channelId])}
                  >
                    <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                    {formatSom(channel.currentPriceSom)}
                  </Button>
                ) : (
                  // Hamkorlik to'xtagan kanalga qayta yuborib bo'lmaydi:
                  // bot u yerda administrator emas.
                  <span className="text-xs text-muted-foreground">Kanal yopilgan</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ChannelPicker selected={selected} onChange={setSelected} />

      {error && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {done && (
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Yuborildi — kanalda tez orada chiqadi.
        </p>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={selected.length === 0 || sending || loading}
        onClick={() => send(selected)}
      >
        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Tanlangan kanallarga yuborish
      </Button>
    </section>
  );
}

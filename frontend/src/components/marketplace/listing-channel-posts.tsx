'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Clock, Loader2, RefreshCw, RotateCw, Wallet } from 'lucide-react';

import { ChannelPicker } from '@/components/marketplace/channel-picker';
import { MeasuredBottomBar } from '@/components/marketplace/measured-bottom-bar';
import { Button } from '@/components/ui/button';
import { useTelegramMainButton } from '@/hooks/use-telegram-main-button';
import { listingAdvertisingHref } from '@/lib/listing-advertising';
import { getWallet } from '@/lib/payment-client';
import type { WalletResponse } from '@/lib/payment-types';
import {
  advertisingShortfallSom, formatAdvertisingPrice, listPostedChannels, orderChannelPosts, postedAgo, searchChannels, totalPrice,
  type ChannelCard, type PostedChannel,
} from '@/lib/partner-channels';
import { topUpHref } from '@/lib/wallet-shortfall';

type Phase = 'choose' | 'review' | 'accepted' | 'uncertain';
interface Props { listingId: string; initialChannelIds?: string[] }

function uniqueChannels(channels: ChannelCard[]) {
  return [...new Map(channels.map(channel => [channel.channelId, channel])).values()];
}

/** A purchase is separate from saving a listing and never retried automatically. */
export function ListingChannelPosts({ listingId, initialChannelIds = [] }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('choose');
  const [selected, setSelected] = useState<ChannelCard[]>([]);
  const [catalogue, setCatalogue] = useState<ChannelCard[]>([]);
  const [posted, setPosted] = useState<PostedChannel[]>([]);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'checking' | 'ordering' | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const actionLock = useRef(false);
  const statusLock = useRef(false);
  const alive = useRef(false);
  const initialVersion = useRef(0);
  const statusVersion = useRef(0);
  const initialized = useRef(false);
  const lastOrderTotal = useRef(0);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const initialKey = [...new Set(initialChannelIds)].join(',');

  const loadInitial = useCallback(async () => {
    const version = ++initialVersion.current;
    setLoading(true);
    setInitialError(null);
    const [channelsResult, walletResult, historyResult] = await Promise.allSettled([
      searchChannels(''), getWallet(), listPostedChannels(listingId),
    ]);
    if (!alive.current || version !== initialVersion.current) return;
    if (channelsResult.status === 'fulfilled') {
      const channels = uniqueChannels(channelsResult.value);
      const ids = initialKey ? initialKey.split(',') : [];
      const byId = new Map(channels.map(channel => [channel.channelId, channel]));
      const hasMissingChannels = ids.some(id => !byId.has(id));
      setCatalogue(channels);
      setSelected(ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []));
      setPhase(ids.length > 0 && !hasMissingChannels ? 'review' : 'choose');
      setActionError(hasMissingChannels
        ? 'Oldin tanlangan ayrim kanallar endi mavjud emas. Mavjud kanallardan tanlang.' : null);
      initialized.current = true;
    } else {
      setInitialError('Kanallar yuklanmadi. Aloqani tekshirib, qayta urinib ko‘ring.');
    }
    setWallet(walletResult.status === 'fulfilled' ? walletResult.value : null);
    setWalletError(walletResult.status === 'fulfilled' ? null : 'Hamyon ma’lumotlari yuklanmadi.');
    if (historyResult.status === 'fulfilled') setPosted(historyResult.value);
    setHistoryError(historyResult.status === 'fulfilled' ? null : 'Chiqish tarixi yuklanmadi.');
    setLoading(false);
  }, [listingId, initialKey]);

  useEffect(() => {
    const pending = initialVersion;
    alive.current = true;
    initialized.current = false;
    setPhase('choose');
    void loadInitial();
    return () => { alive.current = false; pending.current++; };
  }, [loadInitial]);

  const refreshStatus = useCallback(async () => {
    if (!initialized.current || actionLock.current || statusLock.current) return;
    statusLock.current = true;
    const version = ++statusVersion.current;
    setStatusLoading(true);
    const [historyResult, walletResult] = await Promise.allSettled([
      listPostedChannels(listingId), getWallet(),
    ]);
    statusLock.current = false;
    if (!alive.current || version !== statusVersion.current) return;
    if (historyResult.status === 'fulfilled') setPosted(historyResult.value);
    setHistoryError(historyResult.status === 'fulfilled' ? null : 'Chiqish tarixi yuklanmadi.');
    setWallet(walletResult.status === 'fulfilled' ? walletResult.value : null);
    setWalletError(walletResult.status === 'fulfilled' ? null : 'Hamyon ma’lumotlari yuklanmadi.');
    setStatusChecked(historyResult.status === 'fulfilled' && (walletResult.status === 'fulfilled' || lastOrderTotal.current === 0));
    setStatusLoading(false);
  }, [listingId]);

  useEffect(() => {
    const wake = () => { if (!document.hidden) void refreshStatus(); };
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (phase === 'review' || phase === 'accepted' || phase === 'uncertain') {
      reviewHeading.current?.focus({ preventScroll: true });
      reviewHeading.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [phase]);

  const total = totalPrice(selected, selected.map(channel => channel.channelId));
  const missing = wallet ? advertisingShortfallSom(total, wallet.availableTiyin) : 0;
  const returnHref = listingAdvertisingHref(listingId, selected.map(channel => channel.channelId));
  const fundingHref = topUpHref(missing, returnHref);
  const walletHref = `/hamyon?${new URLSearchParams({ keyin: returnHref })}`;
  const finished = phase === 'accepted' || phase === 'uncertain';
  const paidWalletUnavailable = phase === 'review' && total > 0 && !wallet;
  const actionDisabled = loading || !!initialError || !!busy || statusLoading ||
    (!finished && selected.length === 0) || paidWalletUnavailable;
  const actionText = busy === 'ordering' ? 'Buyurtma yuborilmoqda…'
    : busy === 'checking' ? 'Tekshirilmoqda…'
    : finished ? 'Tarix va hamyonni tekshirish'
    : phase === 'choose' ? `Tanlovni ko‘rib chiqish · ${total === 0 && selected.length > 0 ? 'Bepul' : formatAdvertisingPrice(total)}`
    : missing > 0 ? 'Hamyonni to‘ldirish'
    : total === 0 ? 'Bepul joylashni tasdiqlash'
    : `${formatAdvertisingPrice(total)}ga buyurtma berish`;

  // Each explicit review/confirm checks the complete, unpaginated live catalogue.
  // A price change must be seen and confirmed again; it is never silently charged.
  async function checkSelection(wanted: ChannelCard[]) {
    const [channelsResult, walletResult] = await Promise.allSettled([
      searchChannels(''), getWallet(),
    ]);
    if (!alive.current) return null;
    if (channelsResult.status === 'rejected') {
      setActionError('Kanal narxlarini tekshirib bo‘lmadi. Qayta urinib ko‘ring.');
      return null;
    }
    const latest = uniqueChannels(channelsResult.value);
    const byId = new Map(latest.map(channel => [channel.channelId, channel]));
    const available = wanted.flatMap(channel => byId.has(channel.channelId) ? [byId.get(channel.channelId)!] : []);
    setCatalogue(latest);
    setSelected(available);
    setWallet(walletResult.status === 'fulfilled' ? walletResult.value : null);
    setWalletError(walletResult.status === 'fulfilled' ? null : 'Hamyon ma’lumotlari yuklanmadi.');
    if (available.length !== wanted.length) {
      setPhase('choose');
      setActionError('Tanlangan ayrim kanallar endi mavjud emas. Tanlovni tekshiring; buyurtma yuborilmadi.');
      return null;
    }
    return {
      channels: available,
      changed: available.some((channel, index) => channel.priceSom !== wanted[index].priceSom),
      wallet: walletResult.status === 'fulfilled' ? walletResult.value : null,
    };
  }

  async function review(wanted = selected) {
    if (actionLock.current || statusLock.current || wanted.length === 0) return;
    actionLock.current = true;
    statusVersion.current++;
    setBusy('checking');
    setActionError(null);
    try {
      const checked = await checkSelection(uniqueChannels(wanted));
      if (!checked) return;
      setPhase('review');
      if (checked.changed) setActionError('Narx o‘zgardi. Yangi narx va jami summani tekshirib, tasdiqlang.');
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy(null);
    }
  }

  async function submit() {
    if (phase !== 'review' || actionLock.current || statusLock.current || actionDisabled) return;
    actionLock.current = true;
    statusVersion.current++;
    setBusy('checking');
    setActionError(null);
    let mutationStarted = false;
    let needsStatus = false;
    try {
      const checked = await checkSelection(selected);
      if (!checked) return;
      if (checked.changed) {
        setActionError('Narx o‘zgardi. Yangi narx va jami summani tekshirib, qayta tasdiqlang.');
        return;
      }
      const currentTotal = totalPrice(checked.channels, checked.channels.map(channel => channel.channelId));
      if (currentTotal > 0 && (!checked.wallet || advertisingShortfallSom(currentTotal, checked.wallet.availableTiyin) > 0)) return;
      mutationStarted = true;
      lastOrderTotal.current = currentTotal;
      setStatusChecked(false);
      setBusy('ordering');
      await orderChannelPosts(listingId, checked.channels.map(channel => channel.channelId));
      if (alive.current) setPhase('accepted');
      needsStatus = true;
    } catch {
      // An order can have reached the backend even if its response was lost.
      if (alive.current) {
        if (mutationStarted) setPhase('uncertain');
        else setActionError('Tekshiruv bajarilmadi. Qayta urinib ko‘ring.');
      }
      needsStatus = mutationStarted;
    } finally {
      actionLock.current = false;
      if (alive.current) {
        setBusy(null);
        if (needsStatus) void refreshStatus();
      }
    }
  }

  function primaryAction() {
    if (actionDisabled || actionLock.current || statusLock.current) return;
    if (finished) void refreshStatus();
    else if (phase === 'choose') void review();
    else if (missing > 0) router.push(fundingHref);
    else void submit();
  }

  useTelegramMainButton({ text: actionText, onClick: primaryAction, disabled: actionDisabled, loading: !!busy || statusLoading });

  function selectChannels(channels: ChannelCard[]) {
    if (actionLock.current) return;
    setSelected(uniqueChannels(channels));
    setActionError(null);
  }

  return (
    <div className="space-y-5 pb-6">
      {!finished && (
        <ol aria-label="Reklama bosqichlari" className="flex items-center gap-3 text-sm">
          <li aria-current={phase === 'choose' ? 'step' : undefined} className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 font-semibold text-primary dark:text-secondary">{phase === 'review' ? <Check className="h-4 w-4" /> : '1'}</span> Kanallar
          </li>
          <ArrowRight aria-hidden className="h-4 w-4 text-muted-foreground" />
          <li aria-current={phase === 'review' ? 'step' : undefined}>2. Tekshirish va buyurtma</li>
        </ol>
      )}

      {loading ? (
        <p role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Kanallar va hamyon tekshirilmoqda…</p>
      ) : initialError ? (
        <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-4"><p>{initialError}</p><Button variant="outline" onClick={() => void loadInitial()}>Qayta urinish</Button></div>
      ) : (
        <>
          {phase === 'choose' && (
            <>
              {actionError && <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">{actionError}</p>}
              <ChannelPicker selected={selected} onChange={selectChannels} disabled={!!busy} />
              <MeasuredBottomBar data-advertising-summary className="fixed inset-x-0 bottom-0 z-40 border-t border-border surface-nav sm:static sm:rounded-xl sm:border sm:bg-card">
                <section aria-label="Tanlov xulosasi" className="mx-auto max-w-3xl space-y-2.5 pt-3" style={{
                  paddingLeft: 'max(1rem, var(--app-content-safe-left, 0px))',
                  paddingRight: 'max(1rem, var(--app-content-safe-right, 0px))',
                  paddingBottom: 'calc(0.75rem + var(--app-content-safe-bottom, 0px))',
                }}>
                  <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{selected.length} ta kanal</p><p className="text-lg font-semibold">{total === 0 && selected.length > 0 ? 'Bepul' : formatAdvertisingPrice(total)}</p></div>
                  <Button type="button" className="w-full" onClick={primaryAction} disabled={actionDisabled}>{busy && <Loader2 className="animate-spin" />}{busy ? actionText : 'Tanlovni ko‘rib chiqish'}<ArrowRight /></Button>
                  <p className="text-center text-xs text-muted-foreground">Hozir pul olinmaydi. Keyingi qadam — tekshirish.</p>
                </section>
              </MeasuredBottomBar>
            </>
          )}

          {phase === 'review' && (
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 ref={reviewHeading} tabIndex={-1} className="scroll-mt-20 text-xl font-semibold outline-none">Buyurtmani tekshiring</h2>
                <Button variant="ghost" disabled={!!busy} onClick={() => { setPhase('choose'); setActionError(null); }}><ArrowLeft /> Tanlovni o‘zgartirish</Button>
              </div>
              <ul className="divide-y divide-border">
                {selected.map(channel => {
                  const history = posted.find(item => item.channelId === channel.channelId);
                  return (
                    <li key={channel.channelId} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0"><p className="break-words font-medium">{channel.title}</p>
                        {history && history.postedCount > 0 && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Oldin {history.postedCount} marta chiqqan. Bu alohida yangi buyurtma.</p>}
                      </div>
                      <p className="shrink-0 text-sm font-semibold">{channel.priceSom === 0 ? 'Bepul' : formatAdvertisingPrice(channel.priceSom)}</p>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-4"><span className="font-medium">Jami</span><strong className="text-xl">{total === 0 ? 'Bepul' : formatAdvertisingPrice(total)}</strong></div>
              <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
                {wallet ? <p className="flex items-center gap-2"><Wallet className="h-4 w-4 shrink-0" /> Hamyonda: <strong>{formatAdvertisingPrice(wallet.availableTiyin / 100)}</strong></p> : total > 0 ? <p role="alert">{walletError}</p> : <p>Bu tanlov uchun hamyondan pul olinmaydi.</p>}
                {missing > 0 && <p className="font-medium">Yana {formatAdvertisingPrice(missing)} kerak. Hamyonni to‘ldirgach, shu tanlovga qaytasiz.</p>}
                {!wallet && total > 0 && <Button variant="outline" disabled={statusLoading || !!busy} onClick={() => void refreshStatus()}>Hamyonni qayta tekshirish</Button>}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{total > 0 ? 'Mablag‘ buyurtma uchun hamyonda ushlanadi. Post chiqqach kanal egasiga o‘tkaziladi; chiqmasa, o‘sha post haqi hamyonga qaytariladi.' : 'Tanlangan kanallarda bu buyurtma bepul.'}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">Yuborishdan oldin narx va mablag‘ yana tekshiriladi. Yakuniy hisob buyurtma paytidagi kanal narxi bo‘yicha olinadi. Qayta joylash — yangi buyurtma; avvalgi post kanalda qolishi mumkin.</p>
              {historyError && <p role="alert" className="text-sm text-muted-foreground">{historyError} Oldingi chiqishlar hozir ko‘rinmasligi mumkin.</p>}
              {actionError && <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{actionError}</p>}
              {missing > 0 ? <Button asChild className="w-full"><Link href={fundingHref}>{actionText}</Link></Button> : <Button type="button" className="w-full" disabled={actionDisabled} onClick={primaryAction}>{busy && <Loader2 className="animate-spin" />}{actionText}</Button>}
            </section>
          )}

          {finished && (
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
              <div className="flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary dark:text-secondary">{phase === 'accepted' ? <Clock className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}</span><div>
                <h2 ref={reviewHeading} tabIndex={-1} className="scroll-mt-20 text-xl font-semibold outline-none">{phase === 'accepted' ? 'Buyurtma qabul qilindi' : 'Buyurtma natijasi aniqlanmadi'}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{phase === 'accepted' ? 'Bu xabar to‘lov va post chiqishini hali tasdiqlamaydi. Natijani chiqish tarixi va hamyonda tekshiring.' : 'Javob kelmadi, lekin buyurtma bajarilgan bo‘lishi mumkin. Qayta buyurtma berishdan oldin chiqish tarixi va hamyonni tekshiring.'}</p>
              </div></div>
              <p className="text-sm text-muted-foreground">{selected.length} ta kanal · tanlov summasi {formatAdvertisingPrice(lastOrderTotal.current)}</p>
              <Button type="button" className="w-full" disabled={actionDisabled} onClick={primaryAction}>{statusLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}{actionText}</Button>
              <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={walletHref}>Hamyonni ko‘rish</Link></Button><Button asChild variant="ghost"><Link href={`/marketplace/${listingId}`}>E’longa qaytish</Link></Button></div>
              {wallet && <p className="text-sm text-muted-foreground">Hamyonda hozir: {formatAdvertisingPrice(wallet.availableTiyin / 100)} · ushlangan: {formatAdvertisingPrice(wallet.heldTiyin / 100)}</p>}
              {walletError && <p role="alert" className="text-sm text-destructive">{walletError}</p>}
              <div className="space-y-2 border-t border-border pt-4"><p className="text-xs leading-relaxed text-muted-foreground">Tarix va hamyonni ko‘rib chiqqach yangi tanlovni boshlashingiz mumkin. U alohida buyurtma bo‘ladi va yana haq olinishi mumkin.</p><Button variant="outline" disabled={!statusChecked || statusLoading} onClick={() => { setSelected([]); setActionError(null); setPhase('choose'); }}>Yangi tanlovni boshlash</Button></div>
            </section>
          )}

          <section aria-label="Kanal bo‘yicha chiqish tarixi" className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4"><h2 className="font-semibold">Chiqish tarixi</h2><Button variant="ghost" disabled={statusLoading || !!busy} onClick={() => void refreshStatus()}><RefreshCw className={statusLoading ? 'animate-spin' : ''} /> Yangilash</Button></div>
            {historyError ? <div role="alert" className="space-y-2 p-4"><p className="text-sm text-destructive">{historyError}</p><Button variant="outline" onClick={() => void refreshStatus()} disabled={statusLoading}>Tarixni qayta yuklash</Button></div> : posted.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Bu e’lon uchun hali chiqish tarixi yo‘q.</p> : (
              <ul className="divide-y divide-border">
                {posted.map(channel => <li key={channel.channelId} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{channel.channelTitle}</p><p className="mt-1 text-sm text-muted-foreground">{channel.postedCount > 0 ? `${channel.postedCount} marta chiqqan · ${postedAgo(channel.lastPostedAt)}` : 'Chiqishi hali tasdiqlanmagan'}</p></div>{!channel.channelActive && <span className="shrink-0 text-xs text-muted-foreground">Kanal faol emas</span>}</div>
                  {phase === 'choose' && channel.channelActive && channel.postedCount > 0 && <Button variant="outline" className="w-full sm:w-auto" disabled={!!busy || statusLoading} onClick={() => { const card = catalogue.find(item => item.channelId === channel.channelId); if (card) void review([card]); else setActionError('Bu kanal hozir e’lon qabul qilmayapti. Kanallarni qayta tekshiring.'); }}><RotateCw /> Qayta joylashni ko‘rish</Button>}
                </li>)}
              </ul>
            )}
            <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">Faqat chiqqani tasdiqlangan postlar sanaladi. Chiqqan postlar soni buyurtma yoki qaytarilgan to‘lovlar soni emas.</p>
          </section>
        </>
      )}
    </div>
  );
}

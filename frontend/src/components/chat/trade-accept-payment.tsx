'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { UpgradeCta } from '@/components/plans/upgrade-cta';
import { Button } from '@/components/ui/button';
import { InvoicePanel } from '@/components/payment/invoice-panel';
import { useInvoiceWatch } from '@/hooks/use-invoice-watch';
import { createInvoice, getActiveInvoice, getWallet } from '@/lib/payment-client';
import type { InvoiceResponse } from '@/lib/payment-types';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { formatTiyin } from '@/lib/money';
import { MIN_TOP_UP_UZS } from '@/lib/top-up-draft';
import { isInsufficientFunds, shortfallTiyin } from '@/lib/wallet-shortfall';
import { proposalHoldTiyin } from '@/lib/trade-fee';
import { TradeFeeTerms } from './trade-fee-terms';
import type { PendingProposal } from './trade-context';

interface TradeAcceptPaymentProps {
  proposal: PendingProposal;
  viewerId: string;
  unavailable?: boolean;
  onAccept: () => Promise<{ ok: true } | { ok: false; error: string; code?: string; plan?: string }>;
  onAccepted: () => void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}

/** Funding the wallet and authorizing a trade are separate, explicit actions. */
export function TradeAcceptPayment({ proposal, viewerId, unavailable = false, onAccept, onAccepted, onClose, onBusyChange }: TradeAcceptPaymentProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotsPlan, setSlotsPlan] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);
  const [credited, setCredited] = useState(false);
  const deadline = Date.parse(proposal.expiresAt);
  const [expired, setExpired] = useState(() => deadline <= Date.now());
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const walletRequest = useRef(0);
  const invoiceRequest = useRef(0);
  const offerUnavailable = useRef(unavailable);
  offerUnavailable.current = unavailable;
  const requiredTiyin = proposalHoldTiyin(proposal, viewerId);
  const missing = balance === null ? null : shortfallTiyin(requiredTiyin, balance);
  const topUpAmount = missing === null ? 0 : Math.max(MIN_TOP_UP_UZS, missing);

  const refreshWallet = useCallback(async () => {
    const request = ++walletRequest.current;
    setLoading(true);
    try {
      const wallet = await getWallet();
      if (!wallet || !Number.isSafeInteger(wallet.availableTiyin) || wallet.availableTiyin < 0) throw new Error();
      if (!mounted.current || request !== walletRequest.current) return null;
      setBalance(wallet.availableTiyin);
      return wallet.availableTiyin;
    } catch {
      if (mounted.current && request === walletRequest.current) {
        setBalance(null);
        setError('Hamyon holatini o‘qib bo‘lmadi. Qayta urinib ko‘ring.');
      }
      return null;
    } finally {
      if (mounted.current && request === walletRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const invoiceRead = ++invoiceRequest.current;
    void (async () => {
      const available = await refreshWallet();
      if (!active || available === null || shortfallTiyin(requiredTiyin, available) === 0) return;
      try {
        const existing = await getActiveInvoice();
        if (active && invoiceRead === invoiceRequest.current) setInvoice(existing);
      } catch {
        // The explicit top-up action retries this read before creating anything.
      }
    })();
    const onReturn = () => { if (!document.hidden) void refreshWallet(); };
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      active = false;
      mounted.current = false;
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [requiredTiyin, refreshWallet]);

  useEffect(() => {
    if (!Number.isFinite(deadline)) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline]);

  useInvoiceWatch({
    invoiceId: invoice?.id ?? null,
    onPaid: () => {
      invoiceRequest.current++;
      setInvoice(null);
      setCredited(true);
      setError(null);
      void refreshWallet();
    },
  });
  const onInvoiceExpired = useCallback(() => { void refreshWallet(); }, [refreshWallet]);

  async function submit() {
    if (inFlight.current || loading || balance === null || expired || unavailable || deadline <= Date.now()) return;
    inFlight.current = true;
    invoiceRequest.current++;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setSlotsPlan(null);
    try {
      if (missing && missing > 0) {
        // Recheck after the click: a deposit may have arrived while the dialog was open.
        const available = await refreshWallet();
        if (available === null || !mounted.current || offerUnavailable.current || deadline <= Date.now()) return;
        const shortfall = shortfallTiyin(requiredTiyin, available);
        if (shortfall === 0) return; // Funding never authorizes the trade implicitly.
        if (Math.max(MIN_TOP_UP_UZS, shortfall) !== topUpAmount) {
          setError('Balans yangilandi. To‘ldirish summasini tekshirib, qayta tasdiqlang.');
          return;
        }
        const existing = await getActiveInvoice();
        if (!mounted.current || offerUnavailable.current || deadline <= Date.now()) return;
        const next = existing ?? await createInvoice(Math.max(MIN_TOP_UP_UZS, shortfall));
        if (mounted.current) { setInvoice(next); setCredited(false); }
      } else {
        const result = await onAccept();
        if (!result.ok) {
          setError(result.error);
          if (result.code === 'mailbox_slots_exhausted') setSlotsPlan(result.plan ?? 'STANDARD');
          if (isInsufficientFunds(result.error)) await refreshWallet();
          return;
        }
        onAccepted();
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'So‘rov bajarilmadi. Qayta urinib ko‘ring.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="space-y-4">
      <TradeFeeTerms proposal={proposal} viewerId={viewerId} />
      <dl className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">{proposal.kind === 'SWAP_SURCHARGE' ? 'Doplata' : 'Savdo summasi'}</dt>
          <dd className="font-bold">{formatPriceUZS(proposal.priceUzs)}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">Hamyoningizda</dt>
          <dd className="font-semibold">{loading ? 'Tekshirilmoqda…' : balance === null ? 'Aniqlanmadi' : `${formatTiyin(balance)} so‘m`}</dd>
        </div>
        {missing !== null && missing > 0 && <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
          <dt className="text-muted-foreground">Yetishmayapti</dt>
          <dd className="font-bold text-amber-700 dark:text-amber-300">{formatPriceUZS(missing)}</dd>
        </div>}
      </dl>

      <p className="text-sm font-semibold">Hamyondan jami: {formatTiyin(requiredTiyin)} so‘m</p>
      <p className="flex gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        To‘lash va boshlash tugmasini bosganingizda summa hamyoningizdan yechiladi va savdo yakunlanguncha platformada saqlanadi.
        Savdo bekor bo‘lsa, to‘liq qaytariladi.
      </p>
      {proposal.kind === 'SWAP_SURCHARGE' && <p className="text-xs text-muted-foreground">Ikkalangiz tasdiqlagach akkountlar almashinadi.</p>}
      {expired && <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm">
        Taklif muddati tugagan. Sotuvchidan qayta taklif yuborishni so‘rang. To‘ldirilgan mablag‘ hamyoningizda qoladi.
      </p>}
      {unavailable && !expired && <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm">
        Taklif endi faol emas. Joriy taklifni chatdan oching. To‘ldirilgan mablag‘ hamyoningizda qoladi.
      </p>}
      {credited && <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
        Hamyon to‘ldirildi.{!expired && !unavailable && ' Savdoni boshlash uchun to‘lovni tasdiqlang.'}
      </p>}
      {invoice && <div className="space-y-3">
        <p className="text-sm text-muted-foreground">To‘lovdan so‘ng shu savdoga qayting. Balans avtomatik yangilanadi; savdo siz tasdiqlaganingizdan keyin boshlanadi.</p>
        {invoice.requestedTiyin !== topUpAmount * 100 && missing !== null && missing > 0 && <p className="text-xs text-muted-foreground">
          Oldingi to‘ldirish so‘rovingiz davom etmoqda. Unga to‘lov tushgach, savdo uchun qolgan summa qayta hisoblanadi.
        </p>}
        <InvoicePanel compact invoice={invoice} onExpired={onInvoiceExpired} onDismiss={expired || unavailable ? undefined : () => { setInvoice(null); setError(null); }} />
      </div>}
      {!invoice && missing !== null && missing > 0 && missing < MIN_TOP_UP_UZS && !expired && !unavailable && <p className="text-xs text-muted-foreground">
        Eng kam to‘ldirish: {formatPriceUZS(MIN_TOP_UP_UZS)}. Ortiqcha mablag‘ hamyoningizda qoladi.
      </p>}
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {slotsPlan && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"><UpgradeCta plan={slotsPlan} message="" /></div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Yopish</Button>
        {balance === null && !loading && <Button type="button" variant="outline" onClick={() => { setError(null); void refreshWallet(); }}>Qayta urinish</Button>}
        {invoice && <Button type="button" variant="outline" disabled={loading || busy} onClick={() => { setError(null); void refreshWallet(); }}>Balansni tekshirish</Button>}
        {!expired && !unavailable && balance !== null && (missing === 0 || !invoice) && <Button type="button" className="min-h-11 whitespace-normal" disabled={loading || busy} onClick={() => void submit()}>
          {busy ? 'Bajarilmoqda…' : missing === 0 ? `${formatTiyin(requiredTiyin)} so‘m to‘lash va boshlash` : `${formatPriceUZS(topUpAmount)} to‘ldirish`}
        </Button>}
      </div>
    </div>
  );
}

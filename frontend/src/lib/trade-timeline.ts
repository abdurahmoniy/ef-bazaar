import { isHumanTrade } from './trade-human';
import type { TradeKind, TradeMode, TradeResponse, TradeState } from './trade-types';

export type TimelineStatus = 'passed' | 'current' | 'failed' | 'next' | 'unknown';
export interface TimelineStep {
  id: string;
  label: string;
  status: TimelineStatus;
}

type Outcome = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'UNKNOWN';

/** State order follows TradeStateMachine; terminal states do not imply success. */
export function tradeTimeline(outcome: Outcome, trade?: TradeResponse | null, kind?: TradeKind, mode?: TradeMode): TimelineStep[] {
  const human = trade ? isHumanTrade(trade) : mode === 'HUMAN';
  const stages: { id: TradeState; label: string }[] = human ? [
    { id: 'INITIATED', label: 'Savdoni tayyorlash' },
    { id: 'WAITING_ADMIN', label: 'Adminning qabul qilishi' },
    { id: 'IN_PROGRESS', label: 'Admin bilan savdoni bajarish' },
    { id: 'WAITING_CLOSE_CONFIRM', label: 'Tomonlarning yakuniy tasdig‘i' },
    { id: 'SUCCESS', label: 'Savdo yakunlandi' },
  ] : [
    { id: 'INITIATED', label: 'Xavfsiz pochtani tayyorlash' },
    { id: 'WAITING_PAYMENT', label: (trade?.kind ?? kind) === 'SWAP' ? 'Almashish kelishuvini tasdiqlash' : 'To‘lovni tasdiqlash' },
    { id: 'WAITING_EMAIL_CHANGE', label: 'Akkount emailini o‘zgartirish' },
    { id: 'VERIFYING_KONAMI_LINK', label: 'Konami bog‘lanishini tekshirish' },
    { id: 'WAITING_PASSWORD', label: 'Yangi parolni yuborish' },
    { id: 'WAITING_BUYER_VERIFY', label: (trade?.kind ?? kind) === 'SWAP' || (trade?.kind ?? kind) === 'SWAP_SURCHARGE'
      ? 'Ikkala akkountni tekshirish va tasdiqlash' : 'Xaridorning tekshiruvi va tasdig‘i' },
    { id: 'SUCCESS', label: 'Savdo yakunlandi' },
  ];
  const accepted = !!trade || outcome === 'ACCEPTED';
  const rejected = trade?.state === 'REJECTED';
  // A smart rejection happens at verification; a human cancellation happens in progress.
  const failedAt = human ? 'IN_PROGRESS' : 'WAITING_BUYER_VERIFY';
  const current = stages.findIndex(step => step.id === (rejected ? failedAt : trade?.state));
  const unknown = outcome === 'UNKNOWN' || (accepted && !trade) || trade?.state === 'ORPHANED';
  const steps: TimelineStep[] = [
    { id: 'SENT', label: 'Taklif yuborildi', status: 'passed' },
    { id: 'ACCEPTED', label: outcome === 'REJECTED' && !trade ? 'Taklif rad etildi'
      : outcome === 'EXPIRED' && !trade ? 'Taklif muddati tugagan' : 'Taklifni qabul qilish',
      status: accepted ? 'passed' : outcome === 'PENDING' ? 'current'
        : outcome === 'REJECTED' || outcome === 'EXPIRED' ? 'failed' : 'unknown' },
    ...stages.map((step, index): TimelineStep => ({
      ...step,
      status: unknown ? 'unknown' : !trade ? 'next' : trade.state === 'SUCCESS' ? 'passed'
        : index < current ? 'passed'
        : index === current ? rejected ? 'failed' : 'current' : 'next',
    })),
  ];
  if (trade?.state === 'ORPHANED') {
    steps.push({ id: 'ORPHANED', label: 'Savdo muddati tugagan yoki to‘xtagan', status: 'failed' });
  }
  return steps;
}

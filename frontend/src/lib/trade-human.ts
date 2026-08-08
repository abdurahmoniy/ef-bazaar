import { formatPriceUZS } from './marketplace-format';
import type {
  HumanTradeState,
  PendingProposalResponse,
  TradeAdminCardResponse,
  TradeResponse,
  TradeStepResponse,
} from './trade-types';
import type { User } from './types';

const HUMAN_STATES: ReadonlyArray<HumanTradeState> = [
  'WAITING_ADMIN',
  'IN_PROGRESS',
  'WAITING_CLOSE_CONFIRM',
];
const REQUIRED_HUMAN_STEP_COUNT = 6;

export function isTradeAdmin(user: User | null | undefined): boolean {
  return !!user?.roles?.some((role) => role === 'ROLE_TRADE_ADMIN' || role === 'TRADE_ADMIN');
}

export function isHumanTrade(trade: Pick<TradeResponse, 'mode' | 'state'>): boolean {
  return trade.mode === 'HUMAN' || HUMAN_STATES.includes(trade.state as HumanTradeState);
}

export function isHumanProposal(
  proposal: Pick<PendingProposalResponse, 'mode' | 'adminId' | 'adminFeeUzs'> | {
    mode?: 'SMART' | 'HUMAN';
    adminId?: string | null;
    adminFeeUzs?: number | null;
  },
): boolean {
  return proposal.mode === 'HUMAN' || Boolean(proposal.adminId) || proposal.adminFeeUzs != null;
}

export function validateAdminFee(
  admin: Pick<TradeAdminCardResponse, 'minFeeUzs' | 'maxFeeUzs' | 'busy'> | null,
  feeUzs: number,
):
  | { ok: true }
  | {
      ok: false;
      error: string;
    } {
  if (!admin) return { ok: false, error: 'Admin tanlang' };
  if (admin.busy) return { ok: false, error: 'Bu admin hozir band' };
  if (!Number.isFinite(feeUzs) || feeUzs < 1) {
    return { ok: false, error: "Xizmat narxi musbat son bo'lishi kerak" };
  }
  if (feeUzs < admin.minFeeUzs) {
    return {
      ok: false,
      error: `Admin xizmat narxi ${formatPriceUZS(admin.minFeeUzs)} dan kam bo'lmasligi kerak`,
    };
  }
  if (feeUzs > admin.maxFeeUzs) {
    return {
      ok: false,
      error: `Admin xizmat narxi ${formatPriceUZS(admin.maxFeeUzs)} dan oshmasligi kerak`,
    };
  }
  return { ok: true };
}

export function humanStepCompletion(steps: readonly Pick<TradeStepResponse, 'completed'>[]) {
  const completed = steps.filter((step) => step.completed).length;
  const total = steps.length;
  return {
    completed,
    total,
    allDone: total === REQUIRED_HUMAN_STEP_COUNT && completed === REQUIRED_HUMAN_STEP_COUNT,
  };
}

export function formatDurationUz(totalSeconds: number | null | undefined) {
  if (!Number.isFinite(totalSeconds ?? NaN) || (totalSeconds ?? 0) <= 0) return '0 soniya';

  const seconds = Math.max(0, Math.floor(totalSeconds ?? 0));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) {
    const parts = [`${days} kun`];
    if (hours > 0) parts.push(`${hours} soat`);
    return parts.join(' ');
  }
  if (hours > 0) {
    const parts = [`${hours} soat`];
    if (minutes > 0) parts.push(`${minutes} daqiqa`);
    return parts.join(' ');
  }
  if (minutes > 0) return `${minutes} daqiqa`;
  return `${seconds} soniya`;
}

export function secondsUntil(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.floor((target - now) / 1000));
}

import type { BadgeProps } from '@/components/ui/badge';

export type TradeAdminApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface TradeAdminApplicationResponse {
  id: string;
  applicantUserId: string;
  applicantName?: string | null;
  applicantEmail?: string | null;
  applicantTelegramUsername?: string | null;
  status: TradeAdminApplicationStatus;
  reason: string;
  contact?: string | null;
  decisionNote?: string | null;
  reviewerUserId?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface TradeAdminApplicationCreateRequest {
  reason: string;
  contact?: string;
}

export type TradeAdminApplicationStatusFilter = TradeAdminApplicationStatus | 'all';

export function tradeAdminApplicationStatusBadge(
  status: TradeAdminApplicationStatus,
): { label: string; variant: BadgeProps['variant'] } {
  switch (status) {
    case 'PENDING':
      return { label: 'Kutilmoqda', variant: 'warn' };
    case 'APPROVED':
      return { label: 'Tasdiqlangan', variant: 'verified' };
    case 'REJECTED':
      return { label: 'Rad etilgan', variant: 'danger' };
  }
}

export function canSubmitTradeAdminApplication(
  isTradeAdmin: boolean,
  application: TradeAdminApplicationResponse | null | undefined,
): boolean {
  if (isTradeAdmin) return false;
  return !application || application.status === 'REJECTED';
}

export function tradeAdminApplicationStatusText(
  application: TradeAdminApplicationResponse | null | undefined,
): string {
  if (!application) return 'Ariza yuborilmagan';
  switch (application.status) {
    case 'PENDING':
      return "Arizangiz ko'rib chiqilmoqda";
    case 'APPROVED':
      return 'Inson adminlik tasdiqlangan';
    case 'REJECTED':
      return application.decisionNote
        ? `Rad etildi: ${application.decisionNote}`
        : 'Ariza rad etildi';
  }
}

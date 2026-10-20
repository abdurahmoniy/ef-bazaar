import { formatPlanDate } from './plans';
export interface MailboxAccessFields {
  accessState?: 'ACTIVE' | 'GRACE' | 'RECOVERY';
  locked?: boolean;
  paidExpiresAt?: string | null;
  graceEndsAt?: string | null;
  selectedForFree?: boolean;
}
/** Explicit state wins during rollout; legacy locks remain conservative. */
export function mailboxAccess(box: MailboxAccessFields): 'ACTIVE' | 'GRACE' | 'RECOVERY' | 'LOCKED' {
  return box.accessState ?? (box.locked ? 'LOCKED' : 'ACTIVE');
}
export function accessDescription(box: MailboxAccessFields): string {
  const dates = `${box.paidExpiresAt ? ` Pro tugagan: ${formatPlanDate(box.paidExpiresAt)}.` : ''}${box.graceEndsAt ? ` To‘liq o‘qish: ${formatPlanDate(box.graceEndsAt)} gacha.` : ''}`;
  if (mailboxAccess(box) === 'GRACE') return `Grace — xatlar to‘liq o‘qiladi.${dates} 30 kundan keyin Recovery. Yangi Pro joylari ajratilmaydi.`;
  if (mailboxAccess(box) === 'RECOVERY') return `Recovery — faqat muhim Konami tiklash va xavfsizlik xatlari.${dates} Pro uzaytirilsa shu qutilarga to‘liq kirish qaytadi.`;
  return box.selectedForFree ? 'Free uchun tanlangan quti' : 'To‘liq kirish';
}

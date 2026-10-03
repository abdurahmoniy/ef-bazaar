import type { UserbotAccount } from './userbot-types';

export type BadgeTone = 'alive' | 'down' | 'revoked' | 'disconnected';

export function statusBadge(a: UserbotAccount): { label: string; tone: BadgeTone } {
  if (a.status === 'REVOKED') return { label: 'Bekor qilingan', tone: 'revoked' };
  if (a.status === 'DISCONNECTED') return { label: 'Uzilgan', tone: 'disconnected' };
  return a.alive ? { label: 'Tirik', tone: 'alive' } : { label: 'Javob bermayapti', tone: 'down' };
}

export function relativeAgo(iso: string | null, now: Date): string {
  if (!iso) return '—';
  const sec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (sec < 1) return 'hozirgina';
  if (sec < 60) return `${sec} soniya oldin`;
  if (sec < 3600) return `${Math.floor(sec / 60)} daqiqa oldin`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} soat oldin`;
  return `${Math.floor(sec / 86400)} kun oldin`;
}

export function initials(first: string, last: string | null): string {
  const s = `${first.trim().charAt(0)}${(last ?? '').trim().charAt(0)}`.toUpperCase();
  return s || '?';
}

export function handleLine(a: UserbotAccount): string {
  return a.username ? `@${a.username} · ${a.phoneMasked}` : a.phoneMasked;
}

export function sourceLabel(a: UserbotAccount): string {
  return a.source === 'IMPORTED' ? 'Terminal orqali import qilingan' : 'Panel orqali ulangan';
}

export function summarize(list: UserbotAccount[]) {
  return {
    total: list.length,
    alive: list.filter((a) => a.status === 'ACTIVE' && a.alive).length,
    attention: list.filter((a) => a.status === 'REVOKED' || (a.status === 'ACTIVE' && !a.alive)).length,
  };
}

function rank(a: UserbotAccount): number {
  if (a.status === 'ACTIVE' && a.features.length > 0) return 0;
  if (a.status === 'ACTIVE') return 1;
  if (a.status === 'REVOKED') return 2;
  return 3;
}

export function sortAccounts(list: UserbotAccount[]): UserbotAccount[] {
  return [...list].sort((x, y) => rank(x) - rank(y) || x.connectedAt.localeCompare(y.connectedAt));
}

export function bindable(list: UserbotAccount[]): UserbotAccount[] {
  return list.filter((a) => a.status === 'ACTIVE');
}

export function canReconnect(a: UserbotAccount): boolean {
  return a.status === 'REVOKED' || a.status === 'DISCONNECTED';
}

export function codeDestination(codeType: string | undefined): string {
  switch (codeType) {
    case 'APP': return 'Telegram ilovangizga';
    case 'SMS': case 'FRAGMENT_SMS': return 'SMS orqali';
    case 'CALL': case 'FLASH_CALL': case 'MISSED_CALL': return "qo'ng'iroq orqali";
    case 'EMAIL_CODE': return 'emailingizga';
    default: return "Telegram'ga";
  }
}

export function sanitizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

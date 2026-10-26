import type { ChatResponse } from '@/lib/marketplace-types';

const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

const UZ_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Calendar day in UZ time (UTC+5) — used to group messages by date. */
export function uzDayKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const uz = new Date(date.getTime() + UZ_OFFSET_MS);
  return `${uz.getUTCFullYear()}-${uz.getUTCMonth()}-${uz.getUTCDate()}`;
}

/** "Bugun" / "Kecha" / "6 iyul" / "6 iyul 2025" — centered day chips. */
export function formatDayLabel(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';

  const key = uzDayKey(date);
  if (key === uzDayKey(now)) return 'Bugun';
  if (key === uzDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return 'Kecha';

  const uz = new Date(date.getTime() + UZ_OFFSET_MS);
  const label = `${uz.getUTCDate()} ${UZ_MONTHS[uz.getUTCMonth()]}`;
  const nowUz = new Date(now.getTime() + UZ_OFFSET_MS);
  return uz.getUTCFullYear() === nowUz.getUTCFullYear()
    ? label
    : `${label} ${uz.getUTCFullYear()}`;
}

/** "13:31" — per-bubble stamp; the date lives on the day chip. */
export function formatMessageTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const uz = new Date(date.getTime() + UZ_OFFSET_MS);
  return `${String(uz.getUTCHours()).padStart(2, '0')}:${String(uz.getUTCMinutes()).padStart(2, '0')}`;
}

/** Human-readable last seen, using the same Uzbekistan timezone as chat messages. */
export function formatLastSeen(value: string | null, now: Date = new Date()): string {
  if (!value) return 'Oflayn';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Oflayn';
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  let label: string;
  if (minutes < 1) label = 'hozirgina';
  else if (minutes < 60) label = `${minutes} daqiqa oldin`;
  else if (minutes < 24 * 60) label = `${Math.floor(minutes / 60)} soat oldin`;
  else label = `${formatDayLabel(date, now).toLowerCase()} ${formatMessageTime(date)}`;
  return `Oxirgi faollik: ${label}`;
}

/**
 * Returns the display name of the *other* participant of the chat, from the
 * viewer's perspective. The neutral fallback covers the window before the
 * partner's next interaction stamps their verified name onto the chat.
 */
export function partnerName(chat: ChatResponse, viewerId: string): string {
  const viewerIsSeller = chat.sellerId === viewerId;
  const raw = viewerIsSeller ? chat.buyerDisplayName : chat.sellerDisplayName;
  if (raw && raw.trim().length > 0) return raw;
  return 'Foydalanuvchi';
}

export function partnerInitial(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : '?';
}

/**
 * Deterministic avatar color per user id — reused across the chat list and
 * open chat header so a person's circle keeps the same tint everywhere.
 * Fixed identity colors stay dark enough for readable white initials in both themes.
 */
export function avatarTone(userId: string): string {
  const palette = [
    'bg-amber-700 text-white',
    'bg-sky-700 text-white',
    'bg-emerald-700 text-white',
    'bg-rose-700 text-white',
    'bg-violet-700 text-white',
    'bg-teal-700 text-white',
    'bg-fuchsia-700 text-white',
    'bg-indigo-700 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

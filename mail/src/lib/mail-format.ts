/**
 * Uzbek-language formatting helpers for the /mail feature. Kept separate from
 * `chat-format.ts` so tweaks to one surface never accidentally shift copy on
 * the other.
 */

const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

const UZ_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Sidebar-friendly relative age. "hozir" for <60s, then daqiqa / soat /
 * calendar-date once we're past a day. Matches the tone of the rest of the
 * app ("5 daqiqa oldin").
 */
export function relativeUz(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'hozir';
  if (diffSec < 60 * 60) return `${Math.floor(diffSec / 60)} daqiqa oldin`;
  if (diffSec < 60 * 60 * 24) return `${Math.floor(diffSec / (60 * 60))} soat oldin`;

  const uz = new Date(date.getTime() + UZ_OFFSET_MS);
  const day = uz.getUTCDate();
  const month = UZ_MONTHS[uz.getUTCMonth()];
  const nowUz = new Date(now.getTime() + UZ_OFFSET_MS);
  if (uz.getUTCFullYear() === nowUz.getUTCFullYear()) return `${day} ${month}`;
  return `${day} ${month} ${uz.getUTCFullYear()}`;
}

/** Human-sized filesize for attachment chips. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/** First letter of the local-part for the sidebar avatar circle. */
export function mailAvatarInitial(email: string): string {
  if (!email) return '?';
  const at = email.indexOf('@');
  const localPart = at > 0 ? email.substring(0, at) : email;
  return localPart.charAt(0).toUpperCase();
}

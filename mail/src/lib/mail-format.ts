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

/**
 * Absolute UZ-time stamp — "17 iyul 2026, 14:05". Used for tooltips over
 * relative ages and for the reader header where precision matters (2FA codes
 * expire in minutes).
 */
export function fullDateUz(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const uz = new Date(date.getTime() + UZ_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${uz.getUTCDate()} ${UZ_MONTHS[uz.getUTCMonth()]} ${uz.getUTCFullYear()}, ${pad(uz.getUTCHours())}:${pad(uz.getUTCMinutes())}`;
}

/**
 * Collapses sanitised HTML to searchable plain text. Block-level closers and
 * <br> become newlines first so line structure survives — the OTP heuristic
 * below depends on "label line, code on the next line" layouts.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<\s*(?:br\s*\/?|\/(?:p|div|tr|li|h[1-6]|table|blockquote))\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'");
}

/** Keywords that mark a line as "this is about a verification code". Covers
    Uzbek, English and Japanese — Konami sends 2FA mail in EN/JP. */
const OTP_KEYWORD =
  /(kod|code|otp|pin\b|tasdiq|verif|confirm|auth|認証|確認|コード|ワンタイム)/i;

/** Digit runs of OTP-ish length, not embedded in a longer number. */
const DIGIT_GROUP = /(?<!\d)(\d{4,8})(?!\d)/g;

function pickCodeFromLine(line: string): string | null {
  const groups = [...line.matchAll(DIGIT_GROUP)].map((m) => m[1]);
  if (groups.length === 0) return null;
  // Prefer a group that can't be a bare year (© 2026 footers, dates).
  const nonYear = groups.find((g) => g.length !== 4 || !/^(19|20)\d{2}$/.test(g));
  return nonYear ?? groups[0];
}

/**
 * Best-effort extraction of a verification / 2FA code from a message body.
 * Pass whichever bodies exist; plain text is scanned before HTML.
 *
 * Heuristic: a 4–8 digit run on the same line as an OTP keyword, or on one of
 * the next two lines (Konami puts the code on its own line under the label).
 * Falls back to a line that contains nothing but a digit run. Returns null
 * when nothing convincing is found — the UI simply shows no code card.
 */
export function extractOtpCode(
  bodyPlain: string | null | undefined,
  bodyHtml: string | null | undefined,
): string | null {
  const sources = [bodyPlain, bodyHtml ? stripHtml(bodyHtml) : null];
  for (const text of sources) {
    if (!text) continue;
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      if (!OTP_KEYWORD.test(lines[i])) continue;
      for (const candidate of [lines[i], lines[i + 1], lines[i + 2]]) {
        if (!candidate) continue;
        const code = pickCodeFromLine(candidate);
        if (code) return code;
      }
    }

    for (const line of lines) {
      const m = line.trim().match(/^(\d{4,8})$/);
      if (m && !/^(19|20)\d{2}$/.test(m[1])) return m[1];
    }
  }
  return null;
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

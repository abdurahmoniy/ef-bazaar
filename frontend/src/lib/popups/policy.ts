import { UUID_PATTERN } from './campaign-form';
const prefix = 'efbazaar.popup:';
const fallbackSessions = new Map<string, string>();
const fallbackShown = new Set<string>();
const fallbackHistory = new Map<string, number[]>();
let attentionTaken = false;
export function acquireAttention(): (() => void) | null {
  if (attentionTaken) return null;
  attentionTaken = true;
  let released = false;
  return () => { if (!released) { attentionTaken = false; released = true; } };
}
// CompletionNotice consumes this transient flag after the publication render.
export function normalizePopupLocation(location: string): string {
  const [path, query] = location.split('?');
  if (!new RegExp(`^/marketplace/${UUID_PATTERN}$`).test(path)) return location;
  const params = new URLSearchParams(query);
  if (!['created', 'published'].includes(params.get('result') ?? '')) return location;
  params.delete('result');
  return path + (params.size ? `?${params}` : '');
}
export function isPopupRoute(location: string): boolean {
  const [path, query] = location.split('?');
  if (path === '/profile') return ['accounts', 'favorites'].includes(new URLSearchParams(query).get('tab') ?? '');
  return ['/marketplace', '/help', '/invite', '/blacklist'].includes(path)
    || new RegExp(`^/marketplace/${UUID_PATTERN}$`).test(path)
    || /^\/help\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
}
export function isQuietForPopup(doc: Document, ignore?: string): boolean {
  if (doc.visibilityState === 'hidden') return false;
  const active = doc.activeElement;
  if (active?.matches('input,textarea,select,[contenteditable]:not([contenteditable="false"])') || active?.closest('[contenteditable="true"]')) return false;
  return !Array.from(doc.querySelectorAll('[role="dialog"],[role="alertdialog"],[data-interruption-open]'))
    .some(node => !node.closest('[hidden],[aria-hidden="true"],[data-state="closed"]') && node.getAttribute('data-interruption-open') !== ignore);
}
export function getPopupSessionId(userId: string): string {
  const key = `${prefix}session:${userId}`;
  try {
    let value = sessionStorage.getItem(key);
    if (!value || !new RegExp(`^${UUID_PATTERN}$`).test(value)) { value = crypto.randomUUID(); sessionStorage.setItem(key, value); }
    return value;
  } catch {
    if (!fallbackSessions.has(userId)) fallbackSessions.set(userId, crypto.randomUUID());
    return fallbackSessions.get(userId)!;
  }
}
export function canInterrupt(userId: string, now = Date.now()): boolean {
  const session = getPopupSessionId(userId);
  let consumed: boolean; let history: number[];
  try {
    consumed = sessionStorage.getItem(`${prefix}shown:${session}`) === '1';
    const raw: unknown = JSON.parse(localStorage.getItem(`${prefix}history:${userId}`) ?? '[]');
    history = Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
  } catch { consumed = fallbackShown.has(session); history = fallbackHistory.get(userId) ?? []; }
  const recent = history.filter(time => now - time < 86400_000);
  return !consumed && recent.length < 2 && recent.every(time => now - time >= 6*3600_000);
}
export function markInterrupted(userId: string, now = Date.now()): void {
  const session = getPopupSessionId(userId);
  let history = fallbackHistory.get(userId) ?? [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(`${prefix}history:${userId}`) ?? '[]');
    if (Array.isArray(raw)) history = raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  } catch { /* Memory also limits invitations when storage is blocked. */ }
  history = [...history.filter(time => now - time < 86400_000), now];
  fallbackShown.add(session); fallbackHistory.set(userId, history);
  try { sessionStorage.setItem(`${prefix}shown:${session}`, '1'); localStorage.setItem(`${prefix}history:${userId}`, JSON.stringify(history)); } catch { /* Memory fallback above. */ }
}

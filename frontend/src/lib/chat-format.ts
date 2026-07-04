import type { ChatResponse } from '@/lib/marketplace-types';

/**
 * Returns the display name of the *other* participant of the chat, from the
 * viewer's perspective. Falls back to a role label ("Xaridor" / "Sotuvchi")
 * when the snapshot on the backend is null — typically because the chat was
 * created before the buyer/seller name columns existed, or because auth was
 * unreachable at chat-creation time.
 */
export function partnerName(chat: ChatResponse, viewerId: string): string {
  const viewerIsSeller = chat.sellerId === viewerId;
  const raw = viewerIsSeller ? chat.buyerDisplayName : chat.sellerDisplayName;
  if (raw && raw.trim().length > 0) return raw;
  return viewerIsSeller ? 'Xaridor' : 'Sotuvchi';
}

export function partnerInitial(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : '?';
}

/**
 * Deterministic avatar color per user id — reused across the chat list and
 * open chat header so a person's circle keeps the same tint everywhere.
 */
export function avatarTone(userId: string): string {
  const palette = [
    'bg-amber-500 text-amber-50',
    'bg-sky-500 text-sky-50',
    'bg-emerald-500 text-emerald-50',
    'bg-rose-500 text-rose-50',
    'bg-violet-500 text-violet-50',
    'bg-teal-500 text-teal-50',
    'bg-fuchsia-500 text-fuchsia-50',
    'bg-indigo-500 text-indigo-50',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useState } from 'react';
import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';
import { Button } from '@/components/ui/button';
import { fetchNotifications, markNotificationRead, notificationHref, notificationLabel } from '@/lib/notifications-client';
import { NOTIFICATIONS_CHANGED } from '@/lib/firebase-push';
import type { NotificationResponse } from '@/lib/marketplace-types';
import { selectVerificationNotifications, VERIFICATION_CODE_TTL } from '@/lib/verification-notifications';
const dismissedInMemory = new Map<string, Set<string>>();
function dismissedFor(userId: string): Set<string> {
  let ids = dismissedInMemory.get(userId);
  if (!ids) { ids = new Set(); dismissedInMemory.set(userId, ids); }
  try { for (const id of JSON.parse(sessionStorage.getItem(`efbazaar.codes:${userId}`) ?? '[]')) ids.add(id); } catch { /* In-memory fallback. */ }
  return ids;
}
export function VerificationCodeDialog({ userId }: { userId: string | null }) {
  return userId ? <AuthenticatedCodes key={userId} userId={userId} /> : null;
}
function AuthenticatedCodes({ userId }: { userId: string }) {
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [dismissed, setDismissed] = useState(() => new Set(dismissedFor(userId)));
  const [copied, setCopied] = useState(false);
  const current = selectVerificationNotifications(items, dismissed, Date.now())[0];
  const dismiss = useCallback(() => {
    if (!current) return;
    const ids = dismissedFor(userId); ids.add(current.id);
    try { sessionStorage.setItem(`efbazaar.codes:${userId}`, JSON.stringify([...ids])); } catch { /* In-memory fallback. */ }
    setDismissed(new Set(ids)); setCopied(false);
    void markNotificationRead(current.id).then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)));
  }, [current, userId]);
  useTelegramBackLayer({ id: 'verification-code', kind: 'overlay', onBack: dismiss, lockVerticalSwipes: true }, Boolean(current));
  useEffect(() => {
    let cancelled = false; let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      const data = await fetchNotifications(50);
      if (!cancelled) setItems(data);
      pending = false;
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10_000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener(NOTIFICATIONS_CHANGED, refresh); document.removeEventListener('visibilitychange', visible); };
  }, [userId]);
  const currentId = current?.id;
  const currentCreatedAt = current?.createdAt;
  useEffect(() => {
    if (!currentId || !currentCreatedAt) return;
    setCopied(false);
    const timer = window.setTimeout(() => setItems(values => values.filter(n => n.id !== currentId)), Math.max(0, Date.parse(currentCreatedAt) + VERIFICATION_CODE_TTL - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [currentId, currentCreatedAt]);
  if (!current) return null;
  return <Dialog.Root open onOpenChange={open => { if (!open) dismiss(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm" />
    <Dialog.Content data-interruption-open="verification" className="fixed left-1/2 top-1/2 z-[91] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border bg-card p-6 shadow-2xl">
      <Dialog.Title className="text-xl font-bold">{current.type === 'TRADE_EMAIL_CHANGE_CODE' ? 'Konami emailini o‘zgartirish kodi' : 'Konami kirish kodi'}</Dialog.Title>
      <Dialog.Description className="mt-3 text-sm text-muted-foreground">{current.type === 'TRADE_EMAIL_CHANGE_CODE' ? 'Bu kodni Konami emailini o‘zgartirish uchun kiriting.' : 'Bu kodni Konami akkountiga kirish uchun kiriting.'} Kod qisqa muddat amal qiladi.</Dialog.Description>
      <p aria-label="Tasdiqlash kodi" className="my-6 text-center font-mono text-4xl font-bold tracking-widest">{current.verificationCode}</p>
      <div className="grid gap-2">
        <Button onClick={() => { void navigator.clipboard?.writeText(current.verificationCode!).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? 'Nusxalandi' : 'Kodni nusxalash'}</Button>
        <Button variant="outline" asChild><a href={notificationHref(current) ?? '/chats'} onClick={dismiss}>Savdo chatini ochish</a></Button>
        <Button data-code-dismiss variant="ghost" onClick={dismiss}>Yopish</Button>
      </div>
      <span className="sr-only">{notificationLabel(current)}</span>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

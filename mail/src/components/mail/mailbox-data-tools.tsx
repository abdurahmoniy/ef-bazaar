'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { InboxMessage } from '@/lib/mail-types';
export function MailboxDataTools({ mailboxId, messages }: { mailboxId: string; messages: InboxMessage[] }) {
  const router = useRouter();
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), [mailboxId]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [beforeUid, setBeforeUid] = useState<string | null>(null);
  const [exportFinished, setExportFinished] = useState(false);
  async function exportPage() {
    if (busy || !window.confirm('Shaxsiy xatlaringiz .eml formatida ZIP faylga yuklanadi (bir qismda 100 tagacha). Fayl maxfiy ma’lumotlarni saqlashi mumkin. Ushbu qurilmaga eksport qilinsinmi?')) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(null);
    try {
      const qs = new URLSearchParams({ limit: '100' }); if (beforeUid) qs.set('beforeUid', beforeUid);
      const response = await fetch(`/api/trade/v1/mail/${encodeURIComponent(mailboxId)}/export?${qs}`, { credentials: 'include', signal: controller.signal });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? 'Eksport bajarilmadi'); }
      const blob = await response.blob(); if (controller.signal.aborted) return; const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `mail-${mailboxId}-${beforeUid ?? 'latest'}.zip`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      const cursor = response.headers.get('X-Next-Before-Uid'); setBeforeUid(cursor); setExportFinished(!cursor); setNotice(cursor ? 'ZIP qismi yuklandi. Qolgan xatlar uchun keyingi qismni eksport qiling.' : 'Eksport tugadi. ZIP ichida .eml xatlar va manifest.json bor.');
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Eksport bajarilmadi'); } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function cleanup() {
    const ids = selected.filter(id => messages.some(m => m.messageId === id && m.criticalRecovery === false));
    if (busy || ids.length === 0 || ids.length > 100 || !window.confirm(`${ids.length} ta tanlangan xat butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi. Kerakli xatlarni avval eksport qiling. O‘chirilsinmi?`)) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(null);
    try { const response = await fetch(`/api/trade/v1/mail/${encodeURIComponent(mailboxId)}/cleanup`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageIds: ids, confirmDelete: true }), signal: controller.signal }); if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? 'Xatlarni o‘chirish bajarilmadi'); } const result = await response.json(); if (controller.signal.aborted) return; setSelected([]); setNotice(`${result.deleted} ta xat o‘chirildi`); router.refresh(); } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Tozalash bajarilmadi'); } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <details className="border-b border-border bg-card p-4 text-sm">
    <summary className="min-h-11 cursor-pointer font-semibold">Eksport va xatlarni tozalash</summary>
    <div className="space-y-3 pt-3"><p className="text-xs text-muted-foreground">Eksport o‘zingizga tegishli barcha xatlar uchun, Recovery rejimida ham mavjud. ZIP qismlarini alohida saqlang. Muhim Konami tiklash va xavfsizlik xatlari, nizo va huquqiy saqlashdagi xatlar himoyalangan. Holati noma’lum xat o‘chirishga tanlanmaydi. Avtomatik o‘chirish yo‘q.</p>
    <Button variant="outline" size="sm" disabled={busy || exportFinished} onClick={() => void exportPage()}>{beforeUid ? 'Eksport — keyingi 100 xat' : 'Eksport — ZIP / .eml'}</Button>
    {exportFinished && <Button variant="ghost" size="sm" onClick={() => { setExportFinished(false); setBeforeUid(null); }}>Eksportni boshidan boshlash</Button>}
    {messages.length > 0 && <fieldset className="space-y-1"><legend className="font-semibold">Shu sahifadagi xatlar (100 tagacha)</legend>{messages.map(message => <label key={message.messageId} className="flex min-h-11 items-center gap-2"><input type="checkbox" value={message.messageId} checked={selected.includes(message.messageId)} disabled={busy || message.criticalRecovery !== false || (!selected.includes(message.messageId) && selected.length >= 100)} onChange={event => setSelected(ids => event.target.checked ? [...ids, message.messageId] : ids.filter(id => id !== message.messageId))} /><span className="min-w-0 break-words">{message.subject || '(Mavzusiz)'}{message.criticalRecovery !== false ? ' · Himoyalangan' : ''}</span></label>)}<Button variant="destructive" size="sm" disabled={busy || selected.length === 0} onClick={() => void cleanup()}>Tanlangan xatlarni o‘chirish ({selected.length})</Button></fieldset>}
    {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}</div>
  </details>;
}

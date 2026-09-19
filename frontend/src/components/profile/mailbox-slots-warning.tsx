'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Mail, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  deleteMailbox,
  fetchOwnedMailboxes,
  fetchSlotStatus,
  isDeletable,
  slotWarning,
  type MailboxSlotStatus,
  type OwnedMailbox,
} from '@/lib/mailbox-slots';

/**
 * Pochta qutilari to'lganini bildiradi va bo'shatish yo'lini beradi.
 *
 * <p>Slot to'lsa savdoni QABUL QILIB BO'LMAYDI, va ilgari bu faqat
 * "So'rov bajarilmadi" bo'lib ko'rinardi: odam nima bo'lganini ham,
 * nima qilishni ham bilmasdi. Shuning uchun ogohlantirish profilda
 * doimiy turadi — muammo savdo boshlashga urinishdan ANCHA oldin
 * ko'rinishi kerak.
 *
 * <p>Slot bo'shashi bilan o'zi yo'qoladi: hech narsa yopib qo'ymaydi.
 */
export function MailboxSlotsWarning() {
  const [status, setStatus] = useState<MailboxSlotStatus | null>(null);
  const [mailboxes, setMailboxes] = useState<OwnedMailbox[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetchSlotStatus().then(setStatus);
  }, []);

  useEffect(reload, [reload]);

  const warning = slotWarning(status);
  if (!warning) return null;

  async function openList() {
    setError(null);
    try {
      setMailboxes(await fetchOwnedMailboxes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yuklanmadi');
    }
  }

  async function remove(mailbox: OwnedMailbox) {
    if (!window.confirm(
      `${mailbox.email} butunlay o'chiriladi va undagi xatlar qaytarib bo'lmaydi.\n\n`
      + "Bu akkauntning Konami parolini tiklash shu manzilga keladi — "
      + "akkaunt hali sizda bo'lsa, avval Konami'da boshqa pochtaga o'tkazing.\n\nO'chirilsinmi?",
    )) return;
    setError(null);
    setBusy(mailbox.id);
    try {
      await deleteMailbox(mailbox.id);
      setMailboxes((current) => (current ?? []).filter((m) => m.id !== mailbox.id));
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "O'chirib bo'lmadi");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Pochta qutilari to&apos;ldi</h2>
          <p className="text-xs text-muted-foreground">{warning}</p>
        </div>
      </div>

      {mailboxes === null ? (
        <Button type="button" variant="outline" size="sm" onClick={openList}>
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          Pochta qutilarimni ko&apos;rish
        </Button>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {mailboxes.map((mailbox) => (
            <li key={mailbox.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium">{mailbox.email}</p>
                <p className="text-xs text-muted-foreground">
                  {isDeletable(mailbox) ? 'Sizga tegishli · faol savdoga biriktirilmagan' : 'Savdoga biriktirilgan'}
                </p>
              </div>
              {isDeletable(mailbox) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${mailbox.email} pochta qutisini o‘chirish`}
                  className="min-h-11 min-w-11"
                  disabled={busy !== null}
                  onClick={() => remove(mailbox)}
                >
                  {busy === mailbox.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              )}
            </li>
          ))}
          {mailboxes.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">Pochta qutisi yo‘q.</li>
          )}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

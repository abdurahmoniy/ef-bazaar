'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Link2Off, Loader2, Mail } from 'lucide-react';

import { LockedMailboxCard } from '@/components/profile/locked-mailbox-card';
import { UpgradeCta } from '@/components/plans/upgrade-cta';
import { Button } from '@/components/ui/button';
import { getMyAccounts } from '@/lib/accounts-client';
import { mailboxIdFromSearch, showUpgrade, swapCandidates } from '@/lib/mailbox-lock';
import { PLAN_NAMES, type PlanCode } from '@/lib/plans';
import {
  accountEmailSet,
  detachMailbox,
  fetchOwnedMailboxes,
  fetchSlotStatus,
  isAttachedTo,
  isDeletable,
  slotPressure,
  slotWarning,
  sortForCleanup,
  cleanupCandidates,
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
  const [accountEmails, setAccountEmails] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [wantedId, setWantedId] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetchSlotStatus().then(setStatus);
  }, []);

  useEffect(reload, [reload]);

  // Webmail "qulflangan" sahifasi `/profile?mailbox=<id>` ga yuboradi.
  useEffect(() => {
    setWantedId(mailboxIdFromSearch(window.location.search));
  }, []);

  const wantedLocked = !!wantedId && !!mailboxes?.some((m) => m.locked && m.id === wantedId);
  useEffect(() => {
    if (wantedLocked) document.getElementById('mailboxes')?.scrollIntoView?.({ block: 'start' });
  }, [wantedLocked]);

  const pressure = slotPressure(status);
  const warning = slotWarning(status);
  const lockedCount = status?.lockedCount ?? 0;

  // Qulflangan qutilar bo'lsa ro'yxat tugma bosilmasdan yuklanadi:
  // odam ularni ko'rishi va ochishi kerak.
  useEffect(() => {
    if (lockedCount > 0 && mailboxes === null) void openList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedCount]);

  if (!warning && lockedCount === 0) return null;

  async function openList() {
    setError(null);
    try {
      const [boxes, accounts] = await Promise.all([fetchOwnedMailboxes(), getMyAccounts()]);
      // Akkountlar o'qilmasa ham ro'yxat ko'rsatiladi: u holda hamma
      // quti "bog'langan" deb qaraladi, ya'ni hech narsa xato ravishda
      // "o'chirish xavfsiz" deb belgilanmaydi. Bilmaslik "bo'sh" degani emas.
      const emails = accounts.ok
        ? accountEmailSet(accounts.data)
        : new Set<string>(boxes.map((box) => box.email.trim().toLowerCase()));
      setAccountEmails(emails);
      setMailboxes(sortForCleanup(cleanupCandidates(boxes), emails));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yuklanmadi');
    }
  }

  async function remove(mailbox: OwnedMailbox) {
    const attached = isAttachedTo(mailbox, accountEmails);
    // Quti O'CHIRILMAYDI — u platformada qoladi, uni olib tashlash admin
    // ishi. Lekin siz unga boshqa kira olmaysiz: paroli aylantiriladi.
    // Matn shuni aynan shunday aytishi kerak.
    const message = attached
      ? `${mailbox.email} ro'yxatingizdan chiqadi va siz unga boshqa kira olmaysiz.\n\n`
        + "Bu akkauntning Konami parolini tiklash shu manzilga keladi — "
        + "akkaunt hali sizda bo'lsa, avval Konami'da boshqa pochtaga o'tkazing.\n\nUzilsinmi?"
      : `${mailbox.email} ro'yxatingizdan chiqadi va siz unga boshqa kira olmaysiz. `
        + "Bu quti hech qaysi akkountingizga bog'lanmagan.\n\nUzilsinmi?";
    if (!window.confirm(message)) return;
    setError(null);
    setBusy(mailbox.id);
    try {
      await detachMailbox(mailbox.id);
      setMailboxes((current) => (current ?? []).filter((m) => m.id !== mailbox.id));
      reload();
      // Slot bo'shadi — qulflangan qutilar avtomatik ochilgan bo'lishi mumkin.
      if (lockedCount > 0) await openList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uzib bo'lmadi");
    } finally {
      setBusy(null);
    }
  }

  async function changed() {
    setWantedId(null);
    reload();
    await openList();
  }

  const plan = status?.plan ?? 'STANDARD';
  const planName = PLAN_NAMES[plan as PlanCode] ?? plan;
  const limit = status?.limit ?? null;
  const candidates = swapCandidates(mailboxes ?? []);
  const openBoxes = (mailboxes ?? []).filter((m) => !m.locked);
  const lockedBoxes = (mailboxes ?? []).filter((m) => m.locked);
  const title = lockedCount > 0
    ? 'Pochta qutilari'
    : pressure === 'full' ? "Pochta qutilari to'ldi" : "Pochta qutilari to'lay deb qoldi";
  const summary = lockedCount > 0
    ? `${planName} tarifi · ${limit === null ? 'cheksiz' : `${limit} ta`} ochiq joy · ${lockedCount} ta quti qulflangan`
    : warning;

  return (
    <section id="mailboxes" className="scroll-mt-20 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
      </div>

      {limit !== null && lockedCount > 0 && (
        <div
          role="meter"
          aria-label="Band qutilar"
          aria-valuemin={0}
          aria-valuemax={limit + lockedCount}
          aria-valuenow={Math.min(status?.used ?? 0, limit) + lockedCount}
          className="flex gap-1.5"
        >
          {Array.from({ length: limit + lockedCount }, (_, i) => (
            <span
              key={i}
              className={
                i < limit
                  ? i < Math.min(status?.used ?? 0, limit) ? 'h-2 flex-1 rounded-full bg-primary' : 'h-2 flex-1 rounded-full bg-muted-foreground/30'
                  : 'h-2 flex-1 rounded-full bg-amber-500/70'
              }
            />
          ))}
        </div>
      )}

      {pressure === 'full' && showUpgrade(plan) && <UpgradeCta plan={plan} />}

      {mailboxes === null ? (
        <Button type="button" variant="outline" size="sm" onClick={openList}>
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          Pochta qutilarimni ko&apos;rish
        </Button>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {openBoxes.map((mailbox) => (
            <li key={mailbox.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium">{mailbox.email}</p>
                <p className="text-xs text-muted-foreground">
                  {!isDeletable(mailbox)
                    ? 'Savdoga biriktirilgan'
                    : isAttachedTo(mailbox, accountEmails)
                      ? 'Akkountga bog\u2018langan — o\u2018chirilsa akkount tiklab bo\u2018lmas holga keladi'
                      : 'Hech qaysi akkountga bog\u2018lanmagan — o\u2018chirish xavfsiz'}
                </p>
              </div>
              {isDeletable(mailbox) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${mailbox.email} pochta qutisini o‘zimdan uzish`}
                  className="min-h-11 min-w-11"
                  disabled={busy !== null}
                  onClick={() => remove(mailbox)}
                >
                  {busy === mailbox.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Link2Off className="h-3.5 w-3.5" />}
                </Button>
              )}
            </li>
          ))}
          {openBoxes.length === 0 && lockedBoxes.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">Pochta qutisi yo‘q.</li>
          )}
        </ul>
      )}

      {lockedBoxes.length > 0 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {lockedBoxes.map((mailbox) => (
              <LockedMailboxCard
                key={mailbox.id}
                mailbox={mailbox}
                plan={plan}
                limit={limit}
                candidates={candidates}
                onChanged={changed}
                autoOpen={mailbox.id === wantedId}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Qulflangan qutilar o‘chirilmaydi: ichidagi xatlar saqlanadi.
            {showUpgrade(plan) ? ' Tarifni oshirsangiz yoki ochiq qutini uzsangiz' : ' Ochiq qutini uzsangiz'}, ular avtomatik ochiladi.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

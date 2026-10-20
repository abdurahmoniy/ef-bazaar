import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';

import { MailShell } from '@/components/mail/mail-shell';
import { getMe } from '@/lib/auth';
import { getMailboxSlots, getMyMailboxes } from '@/lib/mail-server';
import { mainSiteLoginUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pochta',
};

/**
 * `/` — landing. If the buyer owns any mailboxes we redirect straight into
 * the newest one (deep-linkable, matches Gmail's "first inbox open"
 * behaviour). No mailboxes → empty state with sidebar shown so the shell
 * looks the same as the drilled-in views.
 */
export default async function MailLandingPage() {
  const user = await getMe();
  if (!user) redirect(mainSiteLoginUrl('/'));

  const [mailboxes, slots] = await Promise.all([getMyMailboxes(), getMailboxSlots()]);
  if (mailboxes.length > 0) {
    // Newest owned mailbox first — matches sidebar sort order.
    const [first] = [...mailboxes].sort(
      (a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''),
    );
    redirect(`/${first.id}`);
  }

  return (
    <MailShell slots={slots} mailboxes={mailboxes} activeMailboxId={null}>
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-muted">
          <Inbox className="h-7 w-7 text-muted-foreground/70" />
        </span>
        <h1 className="mt-4 text-lg font-black text-foreground">
          Pochta topilmadi
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Sizga hali biror akkountning pochtasi topshirilmagan. Marketplace&apos;dan
          savdo yakunlanganda pochta shu yerda paydo bo&apos;ladi.
        </p>
      </div>
    </MailShell>
  );
}

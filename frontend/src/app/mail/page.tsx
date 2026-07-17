import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';

import { MailShell } from '@/components/mail/mail-shell';
import { getMe } from '@/lib/auth';
import { getMyMailboxes } from '@/lib/mail-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pochta',
  robots: { index: false, follow: false },
};

/**
 * `/mail` — landing. If the buyer owns any mailboxes we redirect straight
 * into the newest one (deep-linkable, matches Gmail's "first inbox open"
 * behaviour). No mailboxes → empty state with sidebar shown so the shell
 * looks the same as the drilled-in views.
 */
export default async function MailLandingPage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/mail');

  const mailboxes = await getMyMailboxes();
  if (mailboxes.length > 0) {
    // Newest owned mailbox first — matches sidebar sort order.
    const [first] = [...mailboxes].sort(
      (a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''),
    );
    redirect(`/mail/${first.id}`);
  }

  return (
    <MailShell user={user} mailboxes={mailboxes} activeMailboxId={null}>
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-card">
        <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h1 className="mt-3 text-lg font-black text-foreground">
          Pochta topilmadi
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sizga hali biror akkountning pochtasi topshirilmagan. Marketplace&apos;dan
          savdo yakunlanganda pochta shu yerda paydo bo&apos;ladi.
        </p>
      </div>
    </MailShell>
  );
}

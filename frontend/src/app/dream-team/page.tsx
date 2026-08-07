import type { Metadata } from 'next';

import { DreamTeamEditor } from '@/components/marketplace/dream-team-editor';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { getDreamTeams } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dream Team — eFBazaar',
  description:
    "11 ta yulduz o'yinchidan orzu jamoangizni tuzing va shu jamoaga eng mos eFootball akkountlarni toping.",
};

export default async function DreamTeamPage() {
  const result = await getDreamTeams();

  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <header className="mb-4">
        <h1 className="text-lg font-black leading-tight sm:text-2xl">Dream Team</h1>
        <p className="mt-1 text-xs font-semibold text-muted-foreground sm:text-sm">
          Xohlagan 11 o&apos;yinchini tanlang — bozordan shu tarkibga eng mos akkountlar
          topiladi. To&apos;liq mos kelishi shart emas: bir xil o&apos;yinchining boshqa
          kartasi ham hisobga olinadi.
        </p>
      </header>

      {/* 401 here means "not signed in", which the editor handles by starting
          from an empty squad — saving is what prompts for auth. */}
      {!result.ok && result.error.status >= 500 ? (
        <ApiErrorPanel title="Jamoalar yuklanmadi" error={result.error} />
      ) : (
        <DreamTeamEditor
          initialTeams={result.ok ? result.data : []}
          authenticated={result.ok}
        />
      )}
    </main>
  );
}

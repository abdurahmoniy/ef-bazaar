'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ListingForm } from '@/components/marketplace/listing-form';
import { ListingSourceStep } from '@/components/marketplace/listing-source-step';
import { PublishAccountDialog } from '@/components/profile/publish-account-dialog';
import type { UserAccountResponse } from '@/lib/accounts-types';
import type { ListingAttributeDefinition } from '@/lib/marketplace-types';

type EntryView = 'accounts' | 'new' | 'pricing';
const HEADINGS: Record<EntryView, { title: string; description: string }> = {
  accounts: { title: 'Qaysi akkountni sotasiz?', description: 'Saqlangan akkountni tanlang yoki yangisini qo‘shing.' },
  new: { title: 'Yangi akkount', description: 'Ma’lumotlar “Akkountlarim”da ham saqlanadi.' },
  pricing: { title: 'Narx va sotuv shartlari', description: 'Akkount ma’lumotlari tayyor. Sotuv shartlarini belgilang.' },
};

export function NewListingEntry({ accounts, attributeDefinitions, botUsername }: {
  accounts: UserAccountResponse[];
  attributeDefinitions: readonly ListingAttributeDefinition[];
  botUsername: string;
}) {
  const hasAccounts = accounts.some((account) => account.status === 'ACTIVE');
  const [view, setView] = useState<EntryView>(hasAccounts ? 'accounts' : 'new');
  const [startedNew, setStartedNew] = useState(!hasAccounts);
  const [publishing, setPublishing] = useState<UserAccountResponse | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(view);

  const showNew = useCallback(() => { setStartedNew(true); setView('new'); }, []);
  const showAccounts = useCallback(() => setView('accounts'), []);

  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <header>
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-black tracking-tight text-foreground focus:outline-none sm:text-3xl">{HEADINGS[view].title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{HEADINGS[view].description}</p>
      </header>
      {view === 'accounts' && (
        <ListingSourceStep accounts={accounts} onNew={showNew} onPick={(account) => { setPublishing(account); setView('pricing'); }} />
      )}
      {publishing && (
        <div hidden={view !== 'pricing'}>
          <PublishAccountDialog key={publishing.id} layout="page" account={publishing} onClose={showAccounts} />
        </div>
      )}
      {/* Keep browser File objects and draft entries intact while choosing another source. */}
      {startedNew && (
        <div hidden={view !== 'new'}>
          <ListingForm attributeDefinitions={attributeDefinitions} botUsername={botUsername} onBack={hasAccounts ? showAccounts : undefined} />
        </div>
      )}
    </div>
  );
}

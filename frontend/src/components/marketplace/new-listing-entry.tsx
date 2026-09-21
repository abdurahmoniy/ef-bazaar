'use client';

import { useState } from 'react';

import { ListingForm } from '@/components/marketplace/listing-form';
import { ListingSourceStep } from '@/components/marketplace/listing-source-step';
import { PublishAccountDialog } from '@/components/profile/publish-account-dialog';
import type { UserAccountResponse } from '@/lib/accounts-types';
import type { ListingAttributeDefinition } from '@/lib/marketplace-types';

/**
 * E'lon berish oqimining boshi.
 *
 * <p>Tayyor akkount tanlansa faqat sotuv shartlari so'raladi — butun
 * forma qaytadan to'ldirilmaydi. Yangi ma'lumot kiritilsa, e'lon ortida
 * akkount serverda o'zi ochiladi.
 */
export function NewListingEntry({
  accounts,
  attributeDefinitions,
  botUsername,
}: {
  accounts: UserAccountResponse[];
  attributeDefinitions: readonly ListingAttributeDefinition[];
  botUsername: string;
}) {
  const [showForm, setShowForm] = useState(accounts.length === 0);
  const [publishing, setPublishing] = useState<UserAccountResponse | null>(null);

  if (showForm) {
    return <ListingForm attributeDefinitions={attributeDefinitions} botUsername={botUsername} />;
  }

  return (
    <>
      <ListingSourceStep
        accounts={accounts}
        onNew={() => setShowForm(true)}
        onPick={setPublishing}
      />
      {publishing && (
        <PublishAccountDialog account={publishing} onClose={() => setPublishing(null)} />
      )}
    </>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { ListingForm } from '@/components/marketplace/listing-form';
import { PublishAccountDialog } from '@/components/profile/publish-account-dialog';
import type { UserAccountResponse } from '@/lib/accounts-types';
import type { ListingAttributeDefinition } from '@/lib/marketplace-types';

/**
 * "Akkountlarim" uchun forma — e'lon formasining o'zi, narx qadamisiz.
 *
 * <p>Ikkinchi forma yozilmadi: atributlar, o'yinchi tanlagich va rasm
 * yuklash bir xil, ikki nusxada esa ular vaqt o'tib bir-biridan ajralib
 * ketardi.
 */
export function AccountForm({
  attributeDefinitions,
  account,
  botUsername,
  onBack,
  returnTo,
}: {
  attributeDefinitions?: readonly ListingAttributeDefinition[];
  account?: UserAccountResponse;
  botUsername?: string;
  onBack?: () => void;
  /** After saving a new account, go back here (custom mailbox linking) instead of the account list. */
  returnTo?: string;
}) {
  const [publishing, setPublishing] = useState<UserAccountResponse | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showPricing) {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [showPricing]);

  return (
    <div className="space-y-3">
      {account?.onMarket && (
        <p className="rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-xs text-warning">
          Bu akkount hozir bozorda. O&apos;zgarishlar e&apos;longa ham tushadi — narx va obmen
          sharti esa tegilmaydi.
        </p>
      )}
      <div ref={editorRef} hidden={showPricing}>
        <ListingForm
          mode="account"
          attributeDefinitions={attributeDefinitions}
          initialAccount={account}
          botUsername={botUsername}
          onBack={onBack}
          returnTo={returnTo}
          onAccountPublish={account?.onMarket || account?.status === 'ARCHIVED' ? undefined : (saved) => {
            setPublishing(saved);
            setShowPricing(true);
          }}
        />
      </div>
      {publishing && (
        <div hidden={!showPricing} className="space-y-4">
          <header>
            <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold focus:outline-none">Narx va sotuv shartlari</h2>
            <p className="mt-1 text-sm text-muted-foreground">Akkount saqlandi. Narxni belgilang va sotuvga qo&apos;ying.</p>
          </header>
          <PublishAccountDialog key={publishing.id} layout="page" account={publishing} onClose={() => {
            setShowPricing(false);
            // Wait for the editor to be visible before restoring keyboard focus.
            requestAnimationFrame(() => editorRef.current?.querySelector<HTMLButtonElement>('[data-account-publish]')?.focus());
          }} />
        </div>
      )}
    </div>
  );
}

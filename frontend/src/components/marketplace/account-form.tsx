import { ListingForm } from '@/components/marketplace/listing-form';
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
}: {
  attributeDefinitions?: readonly ListingAttributeDefinition[];
  account?: UserAccountResponse;
  botUsername?: string;
}) {
  return (
    <div className="space-y-3">
      {account?.onMarket && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          Bu akkount hozir bozorda. O&apos;zgarishlar e&apos;longa ham tushadi — narx va obmen
          sharti esa tegilmaydi.
        </p>
      )}
      <ListingForm
        mode="account"
        attributeDefinitions={attributeDefinitions}
        initialAccount={account}
        botUsername={botUsername}
      />
    </div>
  );
}

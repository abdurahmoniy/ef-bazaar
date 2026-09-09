import type { Metadata } from 'next';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { SupportNewChatForm } from '@/components/support/support-new-chat-form';
import { SupportPageContainer } from '@/components/support/support-page-container';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';
import type { SupportCategory } from '@/lib/support';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Qo‘llab-quvvatlash va Murojaat',
  description:
    'efBazaar texnik yordam, Telegram kanal hamkorligi va savollar bo‘yicha administratorlar bilan aloqa chati.',
};

interface SupportPageProps {
  searchParams?: Promise<{
    category?: string;
  }>;
}

export default async function SupportPage({ searchParams }: SupportPageProps) {
  const params = searchParams ? await searchParams : {};
  const user = await resolveOptionalUser(getMe);

  let initialCategory: SupportCategory = 'SUPPORT';
  if (params.category === 'PARTNERSHIP') initialCategory = 'PARTNERSHIP';
  else if (params.category === 'QUESTION') initialCategory = 'QUESTION';

  return (
    <MarketplaceShell
      user={user}
      hideSearch
      backHref="/help"
      backLabel="Yordamga qaytish"
    >
      <div className="mx-auto w-full max-w-2xl py-4 sm:py-6">
        <SupportPageContainer user={user} initialCategory={initialCategory} />
      </div>
    </MarketplaceShell>
  );
}

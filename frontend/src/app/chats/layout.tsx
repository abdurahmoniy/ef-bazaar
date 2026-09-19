import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MessengerShell } from '@/components/chat/messenger-shell';
import { getMe } from '@/lib/auth';
import { getMyChatsResult } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Chatlar',
  robots: { index: false, follow: false },
};

interface ChatsLayoutProps {
  children: React.ReactNode;
}

/**
 * Wraps every route under {@code /chats} in the Telegram-style messenger
 * shell. Deliberately does not use {@code MarketplaceShell} — the shell here
 * owns the header. The inbox shares the mobile tabs with the marketplace;
 * open conversations keep the full screen for their messages and composer.
 */
export default async function ChatsLayout({ children }: ChatsLayoutProps) {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/chats');

  const chatsFetchedAt = Date.now();
  const chatsResult = await getMyChatsResult();

  return (
    <MessengerShell chats={chatsResult.ok ? chatsResult.data : []} user={user} initialFetchedAt={chatsResult.ok ? chatsFetchedAt : 0}>
      {children}
    </MessengerShell>
  );
}

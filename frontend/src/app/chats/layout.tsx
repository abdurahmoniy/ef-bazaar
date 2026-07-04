import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MessengerShell } from '@/components/chat/messenger-shell';
import { getMe } from '@/lib/auth';
import { getMyChats } from '@/lib/marketplace-server';

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
 * owns the header, and on mobile there is no top/bottom nav so the chat feels
 * like a real messenger.
 */
export default async function ChatsLayout({ children }: ChatsLayoutProps) {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/chats');

  const chats = await getMyChats();

  return (
    <MessengerShell chats={chats} viewerId={user.id}>
      {children}
    </MessengerShell>
  );
}

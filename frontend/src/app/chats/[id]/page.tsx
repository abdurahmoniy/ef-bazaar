import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { ChatView } from '@/components/chat/chat-view';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { getMe } from '@/lib/auth';
import { getChat, getChatMessages, getListing } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Chat',
  robots: { index: false, follow: false },
};

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const user = await getMe();
  if (!user) redirect(`/auth/login?from=/chats/${id}`);

  const chatResult = await getChat(id);
  if (!chatResult.ok) {
    if (chatResult.error.status === 404) notFound();
    return (
      <div className="p-4">
        <ApiErrorPanel error={chatResult.error} />
      </div>
    );
  }

  const chat = chatResult.data;
  const [messagesPage, listingResult] = await Promise.all([
    getChatMessages(chat.id, 0, 100),
    getListing(chat.listingId),
  ]);

  const listing = listingResult.ok ? listingResult.data : null;

  return (
    <ChatView
      chat={chat}
      viewerId={user.id}
      initialMessages={messagesPage?.content ?? []}
      listing={listing}
    />
  );
}

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { ChatView } from '@/components/chat/chat-view';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { getMe } from '@/lib/auth';
import { getChat, getChatMessages, getListing } from '@/lib/marketplace-server';
import { getPendingProposal } from '@/lib/trade-server';

export const dynamic = 'force-dynamic';
export const unstable_dynamicStaleTime = 30;

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
  const messagesFetchedAt = Date.now();
  const [messagesPage, listingResult, pendingProposal] = await Promise.all([
    getChatMessages(chat.id, 0, 100),
    getListing(chat.listingId),
    getPendingProposal(chat.id),
  ]);

  const listing = listingResult.ok ? listingResult.data : null;

  return (
    <ChatView
      key={`${user.id}:${chat.id}`}
      chat={chat}
      viewerId={user.id}
      initialMessages={messagesPage?.content ?? []}
      initialMessagesComplete={messagesPage !== null && messagesPage.totalPages <= 1}
      initialFetchedAt={messagesPage ? messagesFetchedAt : 0}
      listing={listing}
      initialPendingProposal={pendingProposal}
    />
  );
}

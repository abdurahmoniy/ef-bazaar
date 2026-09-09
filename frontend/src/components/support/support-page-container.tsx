'use client';

import { useEffect, useState } from 'react';
import { Headphones } from 'lucide-react';
import { SupportNewChatForm } from './support-new-chat-form';
import { SupportChatView } from './support-chat-view';
import {
  type SupportCategory,
  type SupportChat,
  getActiveSupportChat,
} from '@/lib/support';
import type { User } from '@/lib/types';

interface SupportPageContainerProps {
  user: User | null;
  initialCategory: SupportCategory;
}

export function SupportPageContainer({
  user,
  initialCategory,
}: SupportPageContainerProps) {
  const [activeChat, setActiveChat] = useState<SupportChat | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getActiveSupportChat()
      .then((chat) => {
        if (!cancelled) {
          setActiveChat(chat);
          if (!chat) {
            setIsCreatingNew(true);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-border bg-card p-5 sm:p-7 shadow-card">
      <div className="flex items-center gap-3 border-b border-border pb-4 mb-5">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary shrink-0">
          <Headphones className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-black text-foreground sm:text-xl leading-tight">
            efBazaar Qo‘llab-quvvatlash
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Texnik yordam, hamkorlik va savollar bo‘yicha to‘g‘ridan-to‘g‘ri aloqa
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          Yuklanmoqda...
        </div>
      ) : activeChat && !isCreatingNew ? (
        <SupportChatView
          initialChat={activeChat}
          onNewChatClick={() => setIsCreatingNew(true)}
        />
      ) : (
        <SupportNewChatForm
          user={user}
          initialCategory={initialCategory}
          onChatCreated={(newChat) => {
            setActiveChat(newChat);
            setIsCreatingNew(false);
          }}
        />
      )}
    </div>
  );
}

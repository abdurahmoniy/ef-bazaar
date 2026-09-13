'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Send, X } from 'lucide-react';
import { LinkTelegramButton } from '@/components/profile/link-telegram-button';
import { Button } from '@/components/ui/button';

export function TelegramRequiredPrompt({
  purpose, botUsername, onClose,
}: {
  purpose: 'listing' | 'contact';
  botUsername: string;
  onClose?: () => void;
}) {
  const [linking, setLinking] = useState(false);
  const title = 'Telegram akkauntingizni ulang';
  const description = purpose === 'listing'
    ? "Telegram akkauntingizni ulang, bu e'loningizga qiziqish bildirayotgan xaridorlardan bildirishnomalar olib turishingizga yordam beradi."
    : "Telegram akkauntingizni ulang, bu sotuvchidan kelgan javoblar va xabarlar haqida bildirishnomalar olib turishingizga yordam beradi.";
  const content = (
    <>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><Send className="h-6 w-6" /></div>
      {onClose ? <Dialog.Title className="pr-6 text-xl font-bold">{title}</Dialog.Title> : <h2 className="text-xl font-bold">{title}</h2>}
      {onClose ? <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">{description}</Dialog.Description> : <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>}
      <p className="mt-3 text-sm font-semibold">{purpose === 'listing' ? "E'lon yaratish uchun Telegramni ulash majburiy." : "Sotuvchi bilan bog'lanish uchun Telegramni ulash majburiy."}</p>
      <div className="mt-5">
        {linking ? <LinkTelegramButton botUsername={botUsername} alreadyLinked={false} onLinked={onClose} /> : (
          <Button type="button" className="w-full" onClick={() => setLinking(true)}><Send className="h-4 w-4" />Telegramni ulash</Button>
        )}
      </div>
    </>
  );
  if (!onClose) return <section className="rounded-2xl border border-border bg-card p-6 shadow-card">{content}</section>;
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
          {content}
          <Dialog.Close asChild><Button variant="ghost" size="icon" className="absolute right-3 top-3" aria-label="Yopish"><X className="h-4 w-4" /></Button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Ellipsis, Star, StarOff, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ChatOptionsProps {
  important: boolean;
  disabled: boolean;
  onToggleImportant: () => void;
  onDelete: () => void;
}

export function ChatOptions({ important, disabled, onToggleImportant, onDelete }: ChatOptionsProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" className="h-11 w-11 shrink-0 p-0" aria-label="Chat amallari">
          <Ellipsis className="h-5 w-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-[91] rounded-t-2xl border border-border bg-card p-3 pb-[calc(var(--app-content-safe-bottom,0px)+0.75rem)] shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-80 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-3">
          <div className="mb-1 flex items-center justify-between pl-3">
            <Dialog.Title className="text-sm font-semibold">Chat amallari</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" className="h-11 w-11 p-0" aria-label="Yopish"><X className="h-5 w-5" /></Button>
            </Dialog.Close>
          </div>
          <button type="button" disabled={disabled} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted disabled:opacity-50" onClick={() => { setOpen(false); onToggleImportant(); }}>
            {important ? <StarOff className="h-5 w-5" /> : <Star className="h-5 w-5" />}
            {important ? 'Muhimni olib tashlash' : 'Muhim deb belgilash'}
          </button>
          <button type="button" disabled={disabled} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50" onClick={() => { setOpen(false); onDelete(); }}>
            <Trash2 className="h-5 w-5" />Chatni o'chirish
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

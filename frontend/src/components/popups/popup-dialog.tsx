'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isSafePopupPath } from '@/lib/popups/campaign-form';
import type { PopupMessage } from '@/lib/popups/types';
import { cn } from '@/lib/utils';

export function PopupDialog({ message, onDismiss, onAction, preview = false }: {
  message: PopupMessage; onDismiss: () => void; onAction?: (path: string) => void; preview?: boolean;
}) {
  const returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const Icon = message.tone === 'SUCCESS' ? Check : message.tone === 'WARNING' ? TriangleAlert : Info;
  const action = message.actionLabel && message.actionPath && isSafePopupPath(message.actionPath);
  return <Dialog.Root open onOpenChange={open => { if (!open) onDismiss(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm" />
      <Dialog.Content onCloseAutoFocus={event => { event.preventDefault(); const target = returnFocus.current; if (target instanceof HTMLElement && target.isConnected) target.focus(); }} data-interruption-open="campaign" className="fixed inset-x-3 bottom-[max(0.75rem,var(--app-content-safe-bottom))] z-[81] mx-auto max-h-[85dvh] w-auto max-w-md overflow-y-auto rounded-3xl border border-border bg-card text-card-foreground shadow-2xl focus:outline-none sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:mx-0 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2">
        <div className="p-6 pb-7 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <span className={cn('grid h-12 w-12 place-items-center rounded-2xl', message.tone === 'SUCCESS' ? 'bg-success-soft text-success' : message.tone === 'WARNING' ? 'bg-warning-soft text-warning' : 'bg-primary/10 text-primary')}><Icon aria-hidden className="h-6 w-6" /></span>
            <Dialog.Close asChild><button aria-label="Xabarni yopish" className="-mr-2 -mt-2 grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden className="h-5 w-5" /></button></Dialog.Close>
          </div>
          {preview && <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Faqat ko‘rib chiqish · yuborilmaydi</p>}
          <Dialog.Title className="mt-5 break-words text-xl font-bold tracking-tight">{message.title}</Dialog.Title>
          <Dialog.Description className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{message.message}</Dialog.Description>
        </div>
        <div className="grid gap-2 border-t border-border bg-muted/40 p-4 sm:px-8 sm:py-5">
          {action && <Button data-popup-action className="min-h-12 w-full rounded-xl" onClick={() => { if (preview) onDismiss(); else onAction?.(message.actionPath!); }}>{message.actionLabel}</Button>}
          <Button data-popup-dismiss variant={action ? 'ghost' : 'default'} className="min-h-11 w-full rounded-xl" onClick={onDismiss}>{action ? 'Hozir emas' : 'Tushunarli'}</Button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

'use client';

import { useCallback, useId, type ReactNode, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';
import { Button } from '@/components/ui/button';
import { useMobileVisualViewport } from '@/hooks/use-mobile-visual-viewport';

interface CardPickerMobileDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  inputRef: RefObject<HTMLInputElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  selectedCount: number;
  max: number;
  search: ReactNode;
  results: ReactNode;
}

export function CardPickerMobileDialog({
  open, onOpenChange, inputRef, triggerRef, selectedCount, max, search, results,
}: CardPickerMobileDialogProps) {
  const viewport = useMobileVisualViewport();
  const layerId = useId();
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useTelegramBackLayer({ id: layerId, kind: 'overlay', onBack: close, lockVerticalSwipes: true }, open);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content
          className="fixed inset-x-0 top-0 z-[60] flex h-[var(--tg-viewport-height,100dvh)] flex-col overflow-hidden bg-card text-foreground shadow-2xl outline-none"
          style={viewport ? { height: viewport.height, top: viewport.offsetTop } : undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = triggerRef.current;
            const target = trigger?.disabled
              ? trigger.parentElement?.querySelector<HTMLButtonElement>('button:not(:disabled)')
              : trigger;
            target?.focus({ preventScroll: true });
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-bold">O'yinchi tanlash</Dialog.Title>
              <p className="text-xs text-muted-foreground" aria-live="polite">Tanlangan: {selectedCount} / {max}</p>
            </div>
            <Dialog.Close asChild>
              <Button type="button" size="sm" className="min-h-11 px-4">Tayyor</Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            O'yinchi nomini yozing va ro'yxatdan kerakli kartani tanlang.
          </Dialog.Description>
          <div className="shrink-0 border-b border-border px-4 pb-3">{search}</div>
          {results}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

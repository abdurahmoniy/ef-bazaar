'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

import { MailSidebar } from '@/components/mail/mail-sidebar';
import type { MailboxSlotStatus, MailboxSummary } from '@/lib/mail-types';

interface MobileSidebarProps {
  mailboxes: MailboxSummary[];
  slots?: MailboxSlotStatus | null;
  activeMailboxId: string | null;
}

/**
 * Hamburger + slide-in drawer for phones. On lg+ the regular sidebar column
 * is visible and this renders only the (hidden) trigger. Closes on backdrop
 * tap, Escape, and any route change (tapping a mailbox navigates).
 */
export function MobileSidebar({ mailboxes, activeMailboxId, slots }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Route changed → the user picked a mailbox; collapse the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Pochtalar ro'yxatini ochish"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted active:bg-muted"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Portal to <body>: the trigger lives inside the sticky header, whose
          backdrop-filter creates a containing block that would trap and clip
          a position:fixed drawer. */}
      {open && createPortal(
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Pochtalar">
          <button
            type="button"
            aria-label="Yopish"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade-in bg-foreground/40 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[85vw] max-w-xs animate-slide-in-left flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-black text-foreground">Pochtalarim</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Yopish"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <MailSidebar
                mailboxes={mailboxes}
                activeMailboxId={activeMailboxId}
                slots={slots}
                hideHeader
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

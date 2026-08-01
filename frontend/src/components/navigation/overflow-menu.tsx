'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';

interface OverflowMenuProps {
  /**
   * Receives a closer so items can dismiss the menu after acting. Style items
   * with {@link overflowItemClass}.
   */
  children: (close: () => void) => React.ReactNode;
  label?: string;
  className?: string;
}

/** Shared row styling for anything dropped into an {@link OverflowMenu}. */
export const overflowItemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-foreground transition hover:bg-accent/60';

/**
 * Priority+ overflow: the primary action stays visible, everything else folds
 * behind a "…" button. Used where a row had grown to four or five equal-weight
 * buttons and stopped communicating which one mattered.
 */
export function OverflowMenu({ children, label = "Ko'proq amallar", className }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-52 origin-top-right animate-menu-in rounded-xl border border-border bg-card p-1.5 shadow-card-hover"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

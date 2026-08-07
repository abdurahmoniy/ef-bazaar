'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';

interface OverflowMenuProps {
  /**
   * Receives a closer so items can dismiss the menu after acting. Style items
   * with {@link overflowItemClass}.
   *
   * Being a function, this can only be passed from another client component —
   * a server component rendering it fails with "Functions are not valid as a
   * child of Client Components", since functions don't cross the RSC boundary.
   */
  children: (close: () => void) => React.ReactNode;
  label?: string;
  className?: string;
}

/** Shared row styling for anything dropped into an {@link OverflowMenu}. */
export const overflowItemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-foreground transition hover:bg-accent/60';

const MENU_WIDTH = 208;
const VIEWPORT_MARGIN = 8;

interface Position {
  top: number;
  left: number;
}

/**
 * Priority+ overflow: the primary action stays visible, everything else folds
 * behind a "…" button. Used where a row had grown to four or five equal-weight
 * buttons and stopped communicating which one mattered.
 *
 * The panel is portalled to <body> and positioned fixed rather than absolutely
 * inside the trigger's box. On the profile it lives in the gamer card's action
 * footer, and `.gc-card` sets `overflow: hidden` for its rounded corners and
 * gloss layers — an absolutely positioned panel is simply clipped away there,
 * no z-index can rescue it. Portalling also makes the component immune to any
 * future ancestor that creates a stacking context.
 */
export function OverflowMenu({ children, label = "Ko'proq amallar", className }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // Right-align to the trigger, then keep the whole panel on screen — on a
    // 375px phone a right-aligned panel near the edge would otherwise hang off.
    const left = Math.min(
      Math.max(rect.right - MENU_WIDTH, VIEWPORT_MARGIN),
      window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN,
    );
    setPosition({ top: rect.bottom + 8, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // The panel is no longer a descendant of the trigger, so both roots have
      // to be checked before treating a click as "outside".
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // Fixed positioning doesn't follow the page, so track it. `true` catches
    // scrolling in any nested container, not just the document.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-[60] origin-top-right animate-menu-in rounded-xl border border-border bg-card p-1.5 shadow-card-hover"
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </div>
  );
}

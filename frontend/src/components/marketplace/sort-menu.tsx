'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface SortMenuOption {
  id: string;
  label: string;
  href: string;
}

interface SortMenuProps {
  options: SortMenuOption[];
  activeId: string;
  className?: string;
}

/**
 * Sort control for the results header.
 *
 * Sorting used to be the last field of the filter sidebar — below Yulduz
 * o'yinchi, and on a phone below the fold of a sheet you had to open first.
 * Five useful orderings (cheapest, most liked, newest…) were effectively
 * invisible. It belongs next to the result count, where every catalogue puts
 * it. Links rather than a <select>: each ordering is a real URL, so it is
 * shareable and survives back/forward.
 */
export function SortMenu({ options, activeId, className }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.id === activeId) ?? options[0];

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
        className="tap-press flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground shadow-card transition hover:border-primary/40 sm:h-10 sm:px-3"
      >
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <span className="hidden sm:inline">{active?.label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-52 origin-top-right animate-menu-in rounded-xl border border-border bg-card p-1.5 shadow-card-hover"
        >
          {options.map((option) => {
            const isActive = option.id === activeId;
            return (
              <Link
                key={option.id}
                href={option.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition hover:bg-accent/60',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', !isActive && 'invisible')} />
                {option.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

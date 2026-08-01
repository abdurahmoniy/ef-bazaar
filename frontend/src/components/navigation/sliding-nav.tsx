'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

// The marker must be positioned before the browser paints, otherwise it is
// visible at x=0 for a frame and reads as a loading glitch. useLayoutEffect
// does that but warns during SSR, where there is no layout to read.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Last known marker geometry per strip, surviving the remount that a route
 * change causes.
 *
 * Every nav entry is a real `<Link>`, so switching tabs is a navigation: the
 * whole shell unmounts and the marker on the next page is a brand new element
 * with no previous position to transition from. A CSS transition therefore
 * never fires and the marker teleports. (Confirmed in the browser — a probe
 * attribute set on the marker node is gone after navigating.)
 *
 * React's <ViewTransition> would be the idiomatic fix, but it ships only on
 * React's experimental channel; this app is on stable 19.2, which does not
 * export it. Replaying the move from the remembered rect gets the same result
 * with no dependency change. Module scope survives client-side navigation and
 * resets on a full reload — which is correct: a cold load should not animate.
 */
const lastMarkerRect = new Map<string, Indicator>();

export interface SlidingNavItem {
  id: string;
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** Rendered after the label as a dim numeral — not a badge. */
  count?: number;
  /** Opens in the same tab but leaves the nav's own route set. */
  external?: boolean;
}

interface SlidingNavProps {
  items: SlidingNavItem[];
  activeId?: string;
  /**
   * 'pill' — filled capsule behind the active item (tab sets that own a
   * surface). 'underline' — 2px rule under it (header nav, where a pill would
   * read as a button rather than a location).
   */
  variant?: 'pill' | 'underline';
  className?: string;
  ariaLabel: string;
  /**
   * Identity of this strip's marker across route changes — see
   * {@link lastMarkerRect}. Must be unique per strip on a page. Omit to opt
   * out of the cross-navigation slide.
   */
  markerName?: string;
}

interface Indicator {
  left: number;
  width: number;
}

/**
 * Nav strip whose active marker slides between items instead of cutting.
 *
 * The marker is measured from the DOM rather than derived from item widths:
 * labels are Uzbek and the font is loaded async, so any width we compute up
 * front is wrong for the first paint. A ResizeObserver on the track re-measures
 * on font swap, container resize and count changes alike.
 *
 * The marker is absent from the first render and placed in a layout effect, so
 * it mounts already in position rather than sliding in from x=0. Moves within
 * one mount are handled by the CSS transition; moves caused by navigating to
 * another tab are replayed from {@link lastMarkerRect}.
 */
export function SlidingNav({
  items,
  activeId,
  variant = 'pill',
  className,
  ariaLabel,
  markerName,
}: SlidingNavProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  // Only the first placement after a mount replays the remembered move; later
  // measurements (font swap, resize) must not re-animate.
  const replayed = useRef(false);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const el = track.querySelector<HTMLElement>('[data-active="true"]');
    // A zero width means the strip has no layout yet — it is still
    // `display: none` below its breakpoint, the tab is backgrounded, or the
    // font hasn't swapped. Committing that would pin the marker at 0×0 and it
    // would stay there, since nothing re-measures until the *next* resize.
    // Render no marker instead and wait to be called again.
    if (!el || el.offsetWidth === 0) {
      setIndicator(null);
      return;
    }
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, []);

  useIsomorphicLayoutEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track) return;

    const observer = new ResizeObserver(measure);
    observer.observe(track);
    for (const child of Array.from(track.children)) observer.observe(child);

    // ResizeObserver doesn't report elements with no layout box, so it can miss
    // the transition back from "not rendered" to rendered. These two cover the
    // ways that happens: a viewport change crossing the strip's breakpoint, and
    // the webfont swapping under already-laid-out text.
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => {});

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, items, activeId]);

  useIsomorphicLayoutEffect(() => {
    if (!indicator || !markerName) return;
    const previous = lastMarkerRect.get(markerName);
    lastMarkerRect.set(markerName, indicator);

    if (replayed.current) return;
    replayed.current = true;
    if (!previous) return;
    if (previous.left === indicator.left && previous.width === indicator.width) return;

    const marker = markerRef.current;
    if (!marker?.animate) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    marker.animate(
      [
        { transform: `translateX(${previous.left}px)`, width: `${previous.width}px` },
        { transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` },
      ],
      { duration: 300, easing: 'cubic-bezier(.32,.72,0,1)' },
    );
  }, [indicator, markerName]);

  const isPill = variant === 'pill';

  return (
    <nav aria-label={ariaLabel} className={cn('-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0', className)}>
      <div
        ref={trackRef}
        className={cn(
          'relative inline-flex min-w-max items-center',
          isPill ? 'gap-0.5 rounded-full border border-border bg-card p-1' : 'gap-0.5',
        )}
      >
        {indicator && (
          <span
            ref={markerRef}
            aria-hidden
            className={cn(
              'pointer-events-none absolute transition-[transform,width] duration-300 ease-[cubic-bezier(.32,.72,0,1)]',
              isPill
                ? 'inset-y-1 rounded-full bg-primary shadow-sm'
                : 'bottom-0 h-0.5 rounded-full bg-foreground',
            )}
            style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
          />
        )}

        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <Link
              key={item.id}
              href={item.href}
              data-active={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative z-10 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors',
                isActive
                  ? isPill
                    ? 'text-primary-foreground'
                    : 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.icon}
              {item.label}
              {typeof item.count === 'number' && item.count > 0 && (
                <span
                  className={cn(
                    'text-[11px] font-bold tabular-nums',
                    isActive && isPill ? 'text-primary-foreground/70' : 'text-muted-foreground/70',
                  )}
                >
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

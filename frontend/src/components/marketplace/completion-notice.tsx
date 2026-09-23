'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, X } from 'lucide-react';

export function CompletionNotice({ title, description, children, queryKey = 'result', onDismiss, focusOnMount = true }: {
  title: string;
  description: string;
  children?: ReactNode;
  queryKey?: string;
  onDismiss?: () => void;
  focusOnMount?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) heading.current?.focus({ preventScroll: true });
    // A completion is shown on arrival, not again on refresh or browser back.
    const url = new URL(window.location.href);
    if (url.searchParams.has(queryKey)) {
      url.searchParams.delete(queryKey);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [focusOnMount, queryKey]);
  if (dismissed) return null;
  return (
    <section aria-label={title} className="rounded-2xl border border-emerald-600/25 bg-emerald-50 p-4 text-foreground dark:border-emerald-400/30 dark:bg-emerald-950/30 sm:p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden className="mt-1 h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-300" />
        <div className="min-w-0 flex-1" role="status" aria-atomic="true">
          <h2 ref={heading} tabIndex={-1} className="text-base font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-lg">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">{description}</p>
        </div>
        <button type="button" aria-label="Tasdiq xabarini yopish" className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-emerald-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setDismissed(true); onDismiss?.(); }}>
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

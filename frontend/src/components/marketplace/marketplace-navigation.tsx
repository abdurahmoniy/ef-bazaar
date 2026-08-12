'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

interface MarketplaceNavigationContextValue {
  pending: boolean;
  navigate: (href: string) => void;
}

const MarketplaceNavigationContext =
  React.createContext<MarketplaceNavigationContextValue | undefined>(undefined);

export function MarketplaceNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const wasPendingRef = React.useRef(false);

  const navigate = React.useCallback((href: string) => {
    startTransition(() => router.push(href));
  }, [router]);

  React.useEffect(() => {
    const completed = wasPendingRef.current && !pending;
    wasPendingRef.current = pending;
    if (!completed) return;

    const activeElement = document.activeElement;
    if (activeElement instanceof Element && activeElement.closest("[role='dialog']")) return;

    document
      .getElementById('marketplace-results-heading')
      ?.focus({ preventScroll: true });
  }, [pending]);

  const value = React.useMemo(
    () => ({ pending, navigate }),
    [pending, navigate],
  );

  return (
    <MarketplaceNavigationContext.Provider value={value}>
      {children}
    </MarketplaceNavigationContext.Provider>
  );
}

export function useMarketplaceNavigation() {
  return React.useContext(MarketplaceNavigationContext);
}

type MarketplacePendingLinkProps = Omit<React.ComponentProps<typeof Link>, 'href'> & {
  href: string;
};

function isExternalHref(href: string) {
  try {
    return new URL(href, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

export interface MarketplaceLinkClickDecision {
  navigationAvailable: boolean;
  external: boolean;
  download?: string | boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
  target?: string;
}

export function shouldInterceptMarketplaceLinkClick({
  navigationAvailable,
  external,
  download,
  defaultPrevented,
  metaKey,
  ctrlKey,
  shiftKey,
  altKey,
  button,
  target,
}: MarketplaceLinkClickDecision) {
  if (!navigationAvailable || external || (download !== undefined && download !== false)) {
    return false;
  }
  const modified = metaKey || ctrlKey || shiftKey || altKey;
  const opensAnotherContext = Boolean(target) && target?.toLowerCase() !== '_self';
  return !defaultPrevented && !modified && button === 0 && !opensAnotherContext;
}

export function MarketplacePendingLink({
  href,
  target,
  download,
  onClick,
  ...props
}: MarketplacePendingLinkProps) {
  const navigation = useMarketplaceNavigation();

  return (
    <Link
      {...props}
      href={href}
      target={target}
      download={download}
      onClick={(event) => {
        onClick?.(event);
        const external = isExternalHref(href);
        if (!navigation || !shouldInterceptMarketplaceLinkClick({
          navigationAvailable: Boolean(navigation),
          external,
          download,
          defaultPrevented: event.defaultPrevented,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          button: event.button,
          target,
        })) return;
        event.preventDefault();
        navigation.navigate(href);
      }}
    />
  );
}

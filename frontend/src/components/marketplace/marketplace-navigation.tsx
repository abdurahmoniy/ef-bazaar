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
        if (!navigation || external || (download !== undefined && download !== false)) {
          return;
        }
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (event.defaultPrevented || modified || event.button !== 0 || target === '_blank') return;
        event.preventDefault();
        navigation.navigate(href);
      }}
    />
  );
}

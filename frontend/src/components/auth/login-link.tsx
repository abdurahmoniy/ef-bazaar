'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { buildLoginHref } from '@/lib/safe-redirect';

interface LoginLinkProps {
  className?: string;
  children: ReactNode;
}

/**
 * "Kirish" havolasi joriy sahifani `from=` sifatida uzatadi — login'dan keyin
 * user turgan sahifasiga qaytadi. `useSearchParams` Suspense talab qiladi;
 * fallback faqat path bilan render qiladi.
 */
export function LoginLink(props: LoginLinkProps) {
  return (
    <Suspense fallback={<PathOnlyLoginLink {...props} />}>
      <FullLoginLink {...props} />
    </Suspense>
  );
}

function FullLoginLink({ className, children }: LoginLinkProps) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString();
  return <Link prefetch={false} href={buildLoginHref(pathname, search)} className={className}>{children}</Link>;
}

function PathOnlyLoginLink({ className, children }: LoginLinkProps) {
  const pathname = usePathname();
  return <Link prefetch={false} href={buildLoginHref(pathname, '')} className={className}>{children}</Link>;
}

import type { Metadata } from 'next';

import { AccessRequiredView } from '@/components/auth/access-required-view';
import { apiFetch } from '@/lib/api';
import type { AccessRequirement } from '@/lib/access-requirements';
import { resolvePostLoginPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kirish shartlari',
  robots: { index: false, follow: false },
};

interface AccessRequiredPageProps {
  searchParams?: Promise<{ from?: string }>;
}

export default async function AccessRequiredPage({ searchParams }: AccessRequiredPageProps) {
  const { from } = (searchParams ? await searchParams : {}) as { from?: string };

  // Ro'yxat yuklanmasa ham sahifa ochiladi: "Tekshirish" tugmasi baribir
  // ishlaydi, access-service tushgan bo'lsa esa login o'tib ketadi.
  let requirements: AccessRequirement[] = [];
  try {
    requirements = await apiFetch<AccessRequirement[]>('/access/v1/access-requirements', { auth: false });
  } catch {
    requirements = [];
  }

  return <AccessRequiredView requirements={requirements} from={resolvePostLoginPath(from)} />;
}

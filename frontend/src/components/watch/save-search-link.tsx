import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SaveSearchLink({ rawQuery }: { rawQuery: string }) {
  return <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0">
    <Link href={`/watches?criteria=${encodeURIComponent(rawQuery)}`}><Bookmark aria-hidden className="h-4 w-4" />Qidiruvni saqlash</Link>
  </Button>;
}

import { ImageResponse } from 'next/og';

import { BrandMarkOG } from '@/components/brand/brand-mark-og';

export const runtime = 'edge';

// PWA/manifest and schema.org logo sizes; the favicon itself is /icon.svg
const ALLOWED_SIZES = new Set([192, 512]);

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = Number(size);

  if (!ALLOWED_SIZES.has(px)) {
    return new Response('Not found', { status: 404 });
  }

  return new ImageResponse(<BrandMarkOG size={px} />, { width: px, height: px });
}

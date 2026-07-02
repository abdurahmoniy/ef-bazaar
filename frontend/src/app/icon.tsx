import { ImageResponse } from 'next/og';

import { BrandMarkOG } from '@/components/brand/brand-mark-og';

export const runtime = 'edge';
export const size = {
  width: 64,
  height: 64,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(<BrandMarkOG size={64} />, size);
}

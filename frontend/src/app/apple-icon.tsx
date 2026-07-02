import { ImageResponse } from 'next/og';

import { BrandMarkOG } from '@/components/brand/brand-mark-og';

export const runtime = 'edge';
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<BrandMarkOG size={180} />, size);
}

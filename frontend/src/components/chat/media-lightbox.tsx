'use client';

import { ZoomableLightbox } from '@/components/marketplace/zoomable-lightbox';

interface MediaLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** Fullscreen image viewer with touch zoom support. */
export function MediaLightbox({ src, alt, onClose }: MediaLightboxProps) {
  return <ZoomableLightbox src={src} alt={alt} onClose={onClose} />;
}

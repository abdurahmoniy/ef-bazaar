'use client';

import { ZoomableLightbox } from '@/components/marketplace/zoomable-lightbox';

interface MediaLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

/** Fullscreen image viewer with touch zoom support. */
export function MediaLightbox(props: MediaLightboxProps) {
  return <ZoomableLightbox {...props} swipeDownToClose />;
}

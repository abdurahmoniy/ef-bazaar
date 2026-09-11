'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ListingCardMediaProps {
  src?: string | null;
  alt: string;
  priority?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Telegram's file-id proxy already returns the final bytes; Next's optimizer rejects it. */
export function shouldBypassImageOptimization(src: string) {
  return src.startsWith('/bot/photo/') || src.includes('/bot/photo/');
}

/** A single reserved media box shared by real images and the branded fallback. */
export function ListingCardMedia({
  src,
  alt,
  priority = false,
  className,
  children,
}: ListingCardMediaProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src && failedSrc === src);

  return (
    <div
      data-listing-card-media
      className={cn(
        'listing-card__media relative aspect-[19.5/9] w-full overflow-hidden bg-muted',
        className,
      )}
    >
      {src && !failed ? (
        <Image
          fill
          src={src}
          alt={alt}
          sizes="(max-width: 551px) calc(100vw - 2rem), (max-width: 695px) calc(50vw - 1.5rem), (max-width: 1199px) calc(33vw - 1.5rem), 18rem"
          priority={priority}
          unoptimized={shouldBypassImageOptimization(src)}
          className="object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div
          data-listing-card-fallback
          role="img"
          aria-label={`${alt}: rasm mavjud emas`}
          className="grid h-full w-full place-items-center bg-gradient-to-br from-muted to-muted/40 text-4xl font-black text-muted-foreground/40"
        >
          ef
        </div>
      )}
      {children}
    </div>
  );
}

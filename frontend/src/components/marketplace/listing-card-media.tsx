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
        'listing-card__media relative aspect-[4/3] w-full overflow-hidden bg-muted',
        className,
      )}
    >
      {src && !failed ? (
        <Image
          fill
          src={src}
          alt={alt}
          quality={95}
          // Allow for the 1.625× enlargement when a wide game screenshot fills a 4:3 crop.
          sizes="(max-width: 331px) calc((100vw - 2rem) * 1.625), (max-width: 727px) calc((50vw - 1.375rem) * 1.625), (max-width: 1023px) calc((33vw - 1.5rem) * 1.625), (max-width: 1095px) calc((100vw - 21.5rem) * 0.8125), 26rem"
          priority={priority}
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

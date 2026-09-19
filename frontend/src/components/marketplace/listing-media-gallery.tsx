'use client';

import Image from 'next/image';
import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

import { ZoomableLightbox } from '@/components/marketplace/zoomable-lightbox';
import { cn } from '@/lib/utils';

interface ListingMediaGalleryProps {
  title: string;
  urls: string[];
}

export function ListingMediaGallery({ title, urls }: ListingMediaGalleryProps) {
  const visibleUrls = urls.filter(Boolean).slice(0, 10);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const goNext = useCallback(
    () => setActiveIndex((i) => (i + 1) % visibleUrls.length),
    [visibleUrls.length],
  );
  const goPrev = useCallback(
    () => setActiveIndex((i) => (i - 1 + visibleUrls.length) % visibleUrls.length),
    [visibleUrls.length],
  );

  if (visibleUrls.length === 0) {
    return (
      <div className="grid aspect-[19.5/9] place-items-center rounded-xl border border-border bg-muted text-4xl font-black text-muted-foreground/40">
        ef
      </div>
    );
  }

  const index = Math.min(activeIndex, visibleUrls.length - 1);
  const active = visibleUrls[index];

  return (
    <section>
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <button
          type="button"
          className="group relative block aspect-[19.5/9] w-full touch-pan-y touch-pinch-zoom bg-muted"
          onTouchStart={(event) => {
            suppressClick.current = false;
            touchStart.current = event.touches.length === 1
              ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
          }}
          onTouchMove={(event) => { if (event.touches.length !== 1) touchStart.current = null; }}
          onTouchCancel={() => { touchStart.current = null; }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            const end = event.changedTouches[0];
            if (!start || !end) return;
            const dx = end.clientX - start.x;
            const dy = end.clientY - start.y;
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5 && visibleUrls.length > 1) {
              suppressClick.current = true;
              if (dx < 0) goNext(); else goPrev();
            }
          }}
          onClick={() => {
            if (suppressClick.current) { suppressClick.current = false; return; }
            setLightbox(true);
          }}
          aria-label="Rasmni kattalashtirish"
        >
          {failedUrl === active ? (
            <span className="grid h-full place-items-center px-12 text-sm text-muted-foreground">Rasm yuklanmadi. Asl rasmni ochish uchun bosing.</span>
          ) : (
            <Image
              key={active}
              fill
              src={active}
              alt={`${title} rasmi ${index + 1}`}
              sizes="(max-width: 1023px) calc(100vw - 2rem), 44rem"
              loading="eager"
              onLoad={() => setLoadedUrl(active)}
              onError={() => setFailedUrl(active)}
              className="object-contain"
            />
          )}
          {loadedUrl !== active && failedUrl !== active && <span role="status" className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">Rasm yuklanmoqda…</span>}
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
            <ZoomIn className="h-3.5 w-3.5" /> Kattalashtirish
          </span>
        </button>

        {visibleUrls.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Oldingi rasm"
              className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-card/85 text-foreground shadow-md backdrop-blur transition hover:bg-card active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Keyingi rasm"
              className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-card/85 text-foreground shadow-md backdrop-blur transition hover:bg-card active:scale-95"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
              {index + 1} / {visibleUrls.length}
            </div>
          </>
        )}
      </div>

      {visibleUrls.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
          {visibleUrls.map((url, index) => (
            <button
              type="button"
              key={url}
              onClick={() => setActiveIndex(index)}
              className={cn(
                'shrink-0 overflow-hidden rounded-lg border-2 bg-muted transition',
                index === activeIndex ? 'border-primary' : 'border-transparent hover:border-primary/40',
              )}
              aria-label={`Rasm ${index + 1}`}
              aria-pressed={index === activeIndex}
            >
              <Image
                width={112}
                height={52}
                sizes="112px"
                src={url}
                alt={`${title} rasmi ${index + 1}`}
                loading="lazy"
                decoding="async"
                className="aspect-[19.5/9] w-24 object-cover sm:w-28"
              />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <ZoomableLightbox
          src={active}
          alt={`${title} rasmi ${activeIndex + 1}`}
          title={title}
          onClose={() => setLightbox(false)}
          onPrev={visibleUrls.length > 1 ? goPrev : undefined}
          onNext={visibleUrls.length > 1 ? goNext : undefined}
          hasPrev={visibleUrls.length > 1}
          hasNext={visibleUrls.length > 1}
          currentIndex={activeIndex}
          totalCount={visibleUrls.length}
        />
      )}
    </section>
  );
}

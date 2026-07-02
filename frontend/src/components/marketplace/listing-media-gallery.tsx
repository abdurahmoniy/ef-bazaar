'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ListingMediaGalleryProps {
  title: string;
  urls: string[];
}

export function ListingMediaGallery({ title, urls }: ListingMediaGalleryProps) {
  const visibleUrls = urls.filter(Boolean).slice(0, 10);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const goNext = useCallback(
    () => setActiveIndex((i) => (i + 1) % visibleUrls.length),
    [visibleUrls.length],
  );
  const goPrev = useCallback(
    () => setActiveIndex((i) => (i - 1 + visibleUrls.length) % visibleUrls.length),
    [visibleUrls.length],
  );

  useEffect(() => {
    if (!lightbox) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setLightbox(false);
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightbox, goNext, goPrev]);

  if (visibleUrls.length === 0) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-xl border border-border bg-muted text-4xl font-black text-muted-foreground/40">
        ef
      </div>
    );
  }

  const active = visibleUrls[activeIndex];

  return (
    <section>
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <button
          type="button"
          className="group relative block h-full w-full"
          onClick={() => setLightbox(true)}
          aria-label="Rasmni kattalashtirish"
        >
          <img
            src={active}
            alt={`${title} rasmi ${activeIndex + 1}`}
            loading="eager"
            decoding="async"
            className="aspect-[4/3] w-full bg-muted object-cover transition duration-300 group-hover:scale-[1.01] sm:aspect-[16/10]"
          />
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs font-semibold text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
            <ZoomIn className="h-3.5 w-3.5" /> Kattalashtirish
          </span>
        </button>

        {visibleUrls.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Oldingi rasm"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 shadow-md backdrop-blur transition hover:bg-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Keyingi rasm"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 shadow-md backdrop-blur transition hover:bg-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
              {activeIndex + 1} / {visibleUrls.length}
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
            >
              <img
                src={url}
                alt={`${title} rasmi ${index + 1}`}
                loading="lazy"
                decoding="async"
                className="h-16 w-20 object-cover sm:h-20 sm:w-24"
              />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setLightbox(false);
            }}
            aria-label="Yopish"
            className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={active}
            alt={title}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
          />
          {visibleUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goPrev();
                }}
                aria-label="Oldingi"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goNext();
                }}
                aria-label="Keyingi"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, Play, Send, Volume2, X } from 'lucide-react';
import { guideVideoUrl, type Guide } from '@/lib/guides';
import { HELP_CATEGORIES, type HelpCategory } from '@/lib/help-data';
import { siteConfig } from '@/lib/site';

interface VideoPlayerModalProps {
  guide: Guide | null;
  category: Exclude<HelpCategory, 'all'>;
  onClose: () => void;
}

export function VideoPlayerModal({ guide, category, onClose }: VideoPlayerModalProps) {
  const [loadError, setLoadError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!guide) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [guide]);

  if (!guide) return null;

  const categoryMeta = HELP_CATEGORIES.find((c) => c.id === category);
  const videoSrc = guideVideoUrl(guide.videoFileId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 min-w-0 pr-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Play className="h-3.5 w-3.5 fill-current" />
            </span>
            <div className="min-w-0">
              <h2
                id="video-modal-title"
                className="truncate text-sm font-bold text-foreground sm:text-base"
              >
                {guide.title}
              </h2>
              {categoryMeta && (
                <span className="text-[11px] font-semibold text-primary">
                  {categoryMeta.label}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Video Player Box */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          {loadError ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-white">
              <AlertCircle className="h-10 w-10 text-amber-400 mb-2" />
              <p className="text-sm font-bold">Video yuklashda xatolik yuz berdi</p>
              <p className="mt-1 text-xs text-white/70 max-w-xs">
                Ushbu videoni to&apos;g&apos;ridan-to&apos;g&apos;ri Telegram botimiz orqali ko&apos;rishingiz mumkin.
              </p>
              <a
                href={siteConfig.links.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-primary/90"
              >
                <Send className="h-3.5 w-3.5" />
                Telegramda ochish
              </a>
            </div>
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              autoPlay
              playsInline
              onError={() => setLoadError(true)}
              className="h-full w-full object-contain"
            />
          )}
        </div>

        {/* Video Meta & Actions */}
        <div className="flex flex-col gap-3 p-4 sm:p-6 overflow-y-auto max-h-48">
          <p className="whitespace-pre-wrap text-xs text-muted-foreground sm:text-sm leading-relaxed">
            {guide.description}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Volume2 className="h-4 w-4 text-primary" />
              <span>Ovozli va izohli video qo&apos;llanma</span>
            </div>

            <a
              href={siteConfig.links.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground transition hover:bg-muted shadow-sm"
            >
              <Send className="h-3.5 w-3.5 text-primary" />
              <span>Telegram botda ko&apos;rish</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

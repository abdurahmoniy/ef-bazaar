'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, Play, RefreshCw, Send, Volume2, X } from 'lucide-react';
import { guideVideoUrl, type Guide } from '@/lib/guides';
import { HELP_CATEGORIES, type HelpCategory } from '@/lib/help-data';
import { siteConfig } from '@/lib/site';

interface VideoPlayerModalProps {
  guide: Guide | null;
  category: Exclude<HelpCategory, 'all'>;
  onClose: () => void;
}

export function VideoPlayerModal({ guide, category, onClose }: VideoPlayerModalProps) {
  if (!guide) return null;
  return (
    <GuideVideoPlayer
      key={`${guide.id}:${guide.videoFileId}`}
      guide={guide}
      category={category}
      onClose={onClose}
    />
  );
}

function GuideVideoPlayer({ guide, category, onClose }: VideoPlayerModalProps & { guide: Guide }) {
  const [loadError, setLoadError] = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);
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
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [guide]);

  const categoryMeta = HELP_CATEGORIES.find((c) => c.id === category);
  const telegramGuideLink = guide?.id
    ? `${siteConfig.links.telegram}?start=guide_${guide.id}`
    : siteConfig.links.telegram;

  // Progressive fallback candidate URLs:
  // 1. Next.js server-side streaming proxy (/api/video/...)
  // 2. Next.js /bot/file rewrite
  // 3. Absolute prod /bot/file fallback
  const candidateUrls = [
    guideVideoUrl(guide.videoFileId),
    `/bot/file/${encodeURIComponent(guide.videoFileId)}?name=guide.mp4`,
    `https://efbazaar.uz/bot/file/${encodeURIComponent(guide.videoFileId)}?name=guide.mp4`,
  ];
  const activeSrc = candidateUrls[Math.min(fallbackIndex, candidateUrls.length - 1)];

  function handleVideoError() {
    if (fallbackIndex < candidateUrls.length - 1) {
      setFallbackIndex((prev) => prev + 1);
    } else {
      setLoadError(true);
    }
  }

  function handleRetry() {
    setLoadError(false);
    setFallbackIndex(0);
    if (videoRef.current) {
      videoRef.current.load();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={guide.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Play className="h-4 w-4 fill-current ml-0.5" />
            </div>
            <div className="min-w-0">
              <h2
                id="video-player-modal-title"
                className="truncate text-sm font-black text-foreground sm:text-base"
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

          <div className="flex items-center gap-2">
            <a
              href={telegramGuideLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border/80 px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition"
              title="Telegram bot orqali ochish"
            >
              <Send className="h-3 w-3 text-primary" />
              <span className="hidden sm:inline">Botda ochish</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Yopish"
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Video Player Box */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          {loadError ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-white">
              <AlertCircle className="h-10 w-10 text-amber-400 mb-2" />
              <p className="text-sm font-bold">Videoni brauzerda yuklab bo&apos;lmadi</p>
              <p className="mt-1.5 text-xs text-white/70 max-w-sm leading-relaxed">
                Video hozir yuklanmadi. Qayta urinib ko&apos;ring yoki Telegram botda oching.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/20"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Qayta urinish
                </button>
                <a
                  href={telegramGuideLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-lg transition hover:bg-primary/90"
                >
                  <Send className="h-3.5 w-3.5" />
                  Botda tomosha qilish
                </a>
              </div>
            </div>
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              key={activeSrc}
              ref={videoRef}
              src={activeSrc}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onError={handleVideoError}
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

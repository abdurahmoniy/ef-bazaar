'use client';

import { Play, Send, Video } from 'lucide-react';
import type { Guide } from '@/lib/guides';
import { HELP_CATEGORIES, type HelpCategory } from '@/lib/help-data';
import { siteConfig } from '@/lib/site';
import { cn } from '@/lib/utils';

interface VideoGuideCardProps {
  guide: Guide;
  category: Exclude<HelpCategory, 'all'>;
  onPlay: (guide: Guide) => void;
}

export function VideoGuideCard({ guide, category, onPlay }: VideoGuideCardProps) {
  const categoryMeta = HELP_CATEGORIES.find((c) => c.id === category);

  return (
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card/80 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card hover:shadow-card sm:p-5">
      <div>
        {/* Top Thumbnail / Banner */}
        <div
          onClick={() => onPlay(guide)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPlay(guide);
            }
          }}
          aria-label={`${guide.title} videosini ko‘rish`}
          className="relative aspect-[16/9] w-full cursor-pointer overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-card to-primary/5 border border-border/60 flex items-center justify-center transition-all group-hover:border-primary/40 group-hover:from-primary/15"
        >
          {/* Subtle grid pattern background */}
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px]"
          />

          {/* Central Play Button */}
          <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform duration-200 group-hover:scale-110 sm:h-14 sm:w-14">
            <Play className="h-5 w-5 fill-current ml-0.5 sm:h-6 sm:w-6" />
          </div>

          {/* Category Badge overlay */}
          {categoryMeta && (
            <div className="absolute left-2.5 top-2.5 z-10">
              <span className="inline-flex items-center gap-1 rounded-md bg-background/90 backdrop-blur-md px-2 py-0.5 text-[11px] font-black text-foreground shadow-sm">
                <Video className="h-3 w-3 text-primary" />
                {categoryMeta.shortLabel}
              </span>
            </div>
          )}

          <div className="absolute right-2.5 bottom-2.5 z-10">
            <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              HD Video
            </span>
          </div>
        </div>

        {/* Content Details */}
        <div className="mt-3.5 space-y-1.5">
          <h3 className="line-clamp-2 text-sm font-black text-foreground sm:text-base leading-snug group-hover:text-primary transition-colors">
            {guide.title}
          </h3>
          <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm leading-relaxed">
            {guide.description}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        <button
          type="button"
          onClick={() => onPlay(guide)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Videoni ko‘rish
        </button>

        <a
          href={guide.id ? `${siteConfig.links.telegram}?start=guide_${guide.id}` : siteConfig.links.telegram}
          target="_blank"
          rel="noopener noreferrer"
          title="Telegram botda ochish"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition"
        >
          <Send className="h-3 w-3 text-primary" />
          <span>Botda</span>
        </a>
      </div>
    </article>
  );
}

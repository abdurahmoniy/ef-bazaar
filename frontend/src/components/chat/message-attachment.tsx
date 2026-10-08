'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';

import { MediaLightbox } from '@/components/chat/media-lightbox';
import { VoicePlayer } from '@/components/chat/voice-player';
import { listingMediaUrl } from '@/lib/marketplace-media';
import type { MessageResponse } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

/**
 * Renders the attachment part of a chat message bubble.
 * IMAGE → inline picture; click opens the fullscreen lightbox.
 * VOICE → Telegram-style player (round play button + waveform bars).
 * FILE with video/* mime → inline <video> player.
 * FILE → download card (bot file proxy: octet-stream + attachment disposition).
 */
export function MessageAttachment({ message, mine, onOpenImage }: { message: MessageResponse; mine: boolean; onOpenImage?: () => void }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const fileId = message.attachmentFileId;
  if (!fileId || !message.attachmentType) return null;

  const photoUrl = listingMediaUrl(fileId) ?? `https://efbazaar.uz/bot/photo/${encodeURIComponent(fileId)}`;
  const fileUrl =
    `https://efbazaar.uz/bot/file/${encodeURIComponent(fileId)}` +
    (message.attachmentName ? `?name=${encodeURIComponent(message.attachmentName)}` : '');

  switch (message.attachmentType) {
    case 'IMAGE':
      return (
        <>
          <button
            type="button"
            onClick={() => onOpenImage ? onOpenImage() : setLightboxOpen(true)}
            className="block w-full cursor-zoom-in"
            aria-label="Rasmni kattalashtirish"
          >
            <img
              src={photoUrl}
              alt={message.attachmentName ?? 'Rasm'}
              loading="lazy"
              decoding="async"
              className="max-h-64 w-full rounded-xl object-cover"
            />
          </button>
          {lightboxOpen && (
            <MediaLightbox
              src={photoUrl}
              alt={message.attachmentName ?? 'Rasm'}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      );
    case 'VOICE':
      return <VoicePlayer src={fileUrl} seed={message.id} mine={mine} />;
    case 'FILE':
    default:
      if (message.attachmentMime?.startsWith('video/')) {
        return (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={fileUrl}
            controls
            preload="metadata"
            playsInline
            className="max-h-64 w-full rounded-xl bg-black"
          />
        );
      }
      return (
        <a
          href={fileUrl}
          className={cn(
            'flex items-center gap-2.5 rounded-xl px-1 py-1 transition',
            mine ? 'hover:bg-white/10' : 'hover:bg-black/5',
          )}
        >
          <span
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-full',
              mine ? 'bg-white/20' : 'bg-primary/15 text-primary',
            )}
          >
            <FileText className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block max-w-52 truncate text-[13px] font-semibold">
              {message.attachmentName ?? 'Fayl'}
            </span>
            {typeof message.attachmentSize === 'number' && message.attachmentSize > 0 && (
              <span className={cn('block text-[10.5px]', mine ? 'opacity-75' : 'text-muted-foreground')}>
                {formatBytes(message.attachmentSize)}
              </span>
            )}
          </span>
        </a>
      );
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

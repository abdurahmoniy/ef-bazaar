'use client';

import { FileText } from 'lucide-react';

import type { MessageResponse } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

/**
 * Renders the attachment part of a chat message bubble.
 * IMAGE → inline picture (bot photo proxy, click opens original).
 * FILE  → download card (bot file proxy: octet-stream + attachment disposition).
 * VOICE → native audio player fed by the same file proxy.
 */
export function MessageAttachment({ message, mine }: { message: MessageResponse; mine: boolean }) {
  const fileId = message.attachmentFileId;
  if (!fileId || !message.attachmentType) return null;

  const photoUrl = `/bot/photo/${encodeURIComponent(fileId)}`;
  const fileUrl =
    `/bot/file/${encodeURIComponent(fileId)}` +
    (message.attachmentName ? `?name=${encodeURIComponent(message.attachmentName)}` : '');

  switch (message.attachmentType) {
    case 'IMAGE':
      return (
        <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={photoUrl}
            alt={message.attachmentName ?? 'Rasm'}
            loading="lazy"
            decoding="async"
            className="max-h-64 w-full rounded-xl object-cover"
          />
        </a>
      );
    case 'VOICE':
      return (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio controls preload="metadata" src={fileUrl} className="h-10 w-56 max-w-full" />
      );
    case 'FILE':
    default:
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

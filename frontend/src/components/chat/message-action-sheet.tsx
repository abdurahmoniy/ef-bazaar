'use client';
import { chatPlainText } from '@/lib/chat-custom-emoji';

import { useEffect } from 'react';
import { Copy, Pencil, Reply, Trash2 } from 'lucide-react';

import type { MessageResponse } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface MessageActionSheetProps {
  message: MessageResponse;
  mine: boolean;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Telegram-style message actions, presented as a bottom sheet (works for both
 * touch and mouse without hover affordances). Edit/Delete only for own
 * messages; Edit only when there is text to edit.
 */
export function MessageActionSheet({
  message,
  mine,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onClose,
}: MessageActionSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canCopy = message.content.trim().length > 0;
  const canEdit = mine && message.content.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Xabar amallari"
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-card p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-card-hover md:rounded-2xl md:pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="truncate px-3 py-2 text-[11px] text-muted-foreground">
          {chatPlainText(message.content).trim() || message.attachmentName || 'Xabar'}
        </p>
        <SheetButton icon={<Reply className="h-4.5 w-4.5" />} label="Javob berish" onClick={onReply} />
        {canCopy && (
          <SheetButton icon={<Copy className="h-4.5 w-4.5" />} label="Nusxa olish" onClick={onCopy} />
        )}
        {canEdit && (
          <SheetButton icon={<Pencil className="h-4.5 w-4.5" />} label="Tahrirlash" onClick={onEdit} />
        )}
        {mine && (
          <SheetButton
            icon={<Trash2 className="h-4.5 w-4.5" />}
            label="O'chirish"
            destructive
            onClick={onDelete}
          />
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full rounded-xl bg-muted px-3 py-2.5 text-sm font-bold text-foreground transition hover:bg-accent"
        >
          Bekor qilish
        </button>
      </div>
    </div>
  );
}

function SheetButton({
  icon,
  label,
  destructive = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-accent',
        destructive ? 'text-destructive' : 'text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

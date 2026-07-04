import Link from 'next/link';
import { ArrowRight, MessageCircle } from 'lucide-react';

interface ProfileChatsProps {
  chatCount: number;
}

/**
 * The full chat list now lives at {@code /chats} as its own Telegram-style
 * screen. The profile tab keeps only a small CTA that jumps into it — avoids
 * duplicating the list and lets the profile tab stay focused on account
 * settings.
 */
export function ProfileChats({ chatCount }: ProfileChatsProps) {
  return (
    <Link
      href="/chats"
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition hover:border-primary/40 hover:shadow-card-hover"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        <MessageCircle className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">Chatlarga o'tish</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {chatCount === 0
            ? "Hali chatlar yo'q"
            : `${chatCount} ta chat`}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

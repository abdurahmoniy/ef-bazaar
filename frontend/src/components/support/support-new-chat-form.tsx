'use client';

import { useState, useTransition } from 'react';
import { ArrowUp, HelpCircle, Handshake, Wrench } from 'lucide-react';
import {
  type SupportCategory,
  type SupportChat,
  SUPPORT_CATEGORIES,
  createSupportChat,
} from '@/lib/support';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SupportNewChatFormProps {
  user: User | null;
  initialMessage?: string;
  initialCategory?: SupportCategory;
  onChatCreated: (chat: SupportChat) => void;
}

const CATEGORY_OPTIONS: Record<SupportCategory, { short: string; icon: React.ElementType; placeholder: string }> = {
  SUPPORT: {
    short: 'Yordam',
    icon: Wrench,
    placeholder: 'Muammoni qisqacha yozing…',
  },
  PARTNERSHIP: {
    short: 'Hamkorlik',
    icon: Handshake,
    placeholder: 'Hamkorlik taklifingizni yozing…',
  },
  QUESTION: {
    short: 'Savol',
    icon: HelpCircle,
    placeholder: 'Savolingizni yozing…',
  },
};

const inputClass =
  'h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

export function SupportNewChatForm({
  user,
  initialMessage = '',
  initialCategory = 'SUPPORT',
  onChatCreated,
}: SupportNewChatFormProps) {
  const [category, setCategory] = useState<SupportCategory>(initialCategory);
  const [senderName, setSenderName] = useState(user?.displayName || '');
  const [senderContact, setSenderContact] = useState(
    user?.telegramUsername ? `@${user.telegramUsername}` : ''
  );
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSend = !isPending && message.trim().length > 0;

  const submit = () => {
    if (!message.trim() || isPending) return;
    if (!user && !senderName.trim()) {
      setError('Iltimos, ismingizni kiriting');
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const chat = await createSupportChat({
          category,
          message: message.trim(),
          senderName: senderName.trim() || undefined,
          senderContact: senderContact.trim() || undefined,
        });
        onChatCreated(chat);
      } catch (err: any) {
        setError(err.message || 'Murojaat yaratib bo‘lmadi');
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-3"
    >
      <p className="text-[15px] font-semibold text-foreground">Qanday yordam bera olamiz?</p>

      {!user && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            aria-label="Ismingiz"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Ismingiz"
            className={inputClass}
          />
          <input
            type="text"
            aria-label="Telegram yoki telefon (ixtiyoriy)"
            value={senderContact}
            onChange={(e) => setSenderContact(e.target.value)}
            placeholder="@username yoki tel."
            className={inputClass}
          />
        </div>
      )}

      {/* Composer: message + category + send in one box */}
      <div className="rounded-2xl border border-border bg-background shadow-sm transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
        <textarea
          rows={3}
          aria-label="Xabaringiz"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={CATEGORY_OPTIONS[category].placeholder}
          className="block max-h-48 min-h-[76px] w-full resize-none bg-transparent px-3.5 pt-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none [field-sizing:content]"
        />

        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div role="radiogroup" aria-label="Murojaat yo‘nalishi" className="flex min-w-0 flex-wrap gap-1">
            {(Object.keys(SUPPORT_CATEGORIES) as SupportCategory[]).map((cat) => {
              const { short, icon: Icon } = CATEGORY_OPTIONS[cat];
              const selected = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={SUPPORT_CATEGORIES[cat].description}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition',
                    selected
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {short}
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={!canSend}
            aria-label={isPending ? 'Yuborilmoqda' : 'Yuborish'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            <ArrowUp className={cn('h-4 w-4', isPending && 'animate-pulse')} />
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Enter — yuborish, Shift+Enter — yangi qator
        </p>
      )}
    </form>
  );
}

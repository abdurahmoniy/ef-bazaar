'use client';

import { useState, useTransition } from 'react';
import { Send, HelpCircle, Handshake, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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

const CATEGORY_ICONS: Record<SupportCategory, React.ElementType> = {
  SUPPORT: Wrench,
  PARTNERSHIP: Handshake,
  QUESTION: HelpCircle,
};

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Category selector */}
      <div>
        <label className="block text-xs font-bold uppercase text-muted-foreground mb-2">
          Murojaat yo‘nalishi
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(Object.keys(SUPPORT_CATEGORIES) as SupportCategory[]).map((cat) => {
            const Icon = CATEGORY_ICONS[cat];
            const def = SUPPORT_CATEGORIES[cat];
            const selected = category === cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  'flex items-center gap-2.5 p-3 rounded-xl border text-left transition text-xs sm:text-sm',
                  selected
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm ring-1 ring-primary/30'
                    : 'border-border bg-card/60 hover:bg-muted text-foreground'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{def.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Guest info if not authenticated */}
      {!user && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">
              Ismingiz <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Masalan: Alisher"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">
              Telegram yoki telefon <span className="text-muted-foreground/70 font-normal">(ixtiyoriy)</span>
            </label>
            <input
              type="text"
              value={senderContact}
              onChange={(e) => setSenderContact(e.target.value)}
              placeholder="@username yoki +998..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      )}

      {/* Message content */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground mb-1">
          Xabaringiz <span className="text-destructive">*</span>
        </label>
        <Textarea
          rows={4}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            category === 'PARTNERSHIP'
              ? 'Assalomu alaykum, kanalimiz bilan hamkorlik qilmoqchi edik...'
              : category === 'QUESTION'
              ? 'Savolingizni bu yerga yozing...'
              : 'Qanday muammoga duch keldingiz? Batafsil yozing...'
          }
          className="resize-none"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end pt-2">
        <Button type="submit" disabled={isPending || !message.trim()} className="gap-1.5 shrink-0">
          <Send className="h-4 w-4" />
          {isPending ? 'Yuborilmoqda...' : 'Yuborish'}
        </Button>
      </div>
    </form>
  );
}

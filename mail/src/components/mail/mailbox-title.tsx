'use client';

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MAILBOX_NAME_MAX_LENGTH, saveMailboxName } from '@/lib/mailbox-name';
import type { MailboxSummary } from '@/lib/mail-types';
import { CopyButton } from './copy-button';

export function MailboxTitle({ mailbox }: { mailbox: MailboxSummary }) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = mailbox.displayName || '';

  useEffect(() => {
    if (editing && !wasEditing.current) {
      input.current?.focus();
      input.current?.select();
      wasEditing.current = true;
    } else if (!editing && !pending && wasEditing.current) {
      editButton.current?.focus();
      wasEditing.current = false;
    }
  }, [editing, pending]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await saveMailboxName(mailbox.id, draft);
        router.refresh();
        setEditing(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Pochta nomi saqlanmadi.');
      }
    });
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="w-full max-w-md space-y-2" aria-busy={pending}>
        <label htmlFor={inputId} className="block text-xs font-semibold text-foreground">
          Pochta nomi
        </label>
        <input
          ref={input}
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !pending) {
              event.preventDefault();
              setEditing(false);
            }
          }}
          maxLength={MAILBOX_NAME_MAX_LENGTH}
          disabled={pending}
          placeholder="Masalan, Asosiy akkaunt"
          aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ''}`}
          aria-invalid={!!error}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <p id={`${inputId}-help`} className="text-[11px] text-muted-foreground">
          Nomni olib tashlash uchun maydonni bo‘sh qoldiring. 60 ta belgigacha.
        </p>
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">{error}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? 'Saqlanmoqda…' : 'Saqlash'}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(false)}>
            Bekor qilish
          </Button>
        </div>
        <p className="truncate text-xs text-muted-foreground" title={mailbox.email}>{mailbox.email}</p>
      </form>
    );
  }

  return (
    <div className="min-w-0" aria-busy={pending}>
      <div className="flex min-w-0 items-center gap-1">
        <h1 className="truncate text-base font-black text-foreground" title={name || mailbox.email}>
          {name || mailbox.email}
        </h1>
        {!name && <CopyButton value={mailbox.email} label="Pochta manzilini nusxalash" />}
        <button
          ref={editButton}
          type="button"
          disabled={pending}
          onClick={() => {
            setDraft(name);
            setError(null);
            setEditing(true);
          }}
          title={name ? 'Pochta nomini o‘zgartirish' : 'Pochta nomini qo‘shish'}
          aria-label={name ? 'Pochta nomini o‘zgartirish' : 'Pochta nomini qo‘shish'}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {name && (
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-xs text-muted-foreground" title={mailbox.email}>{mailbox.email}</span>
          <CopyButton value={mailbox.email} label="Pochta manzilini nusxalash" />
        </div>
      )}
    </div>
  );
}

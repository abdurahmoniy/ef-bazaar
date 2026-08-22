'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, Eye, KeyRound, Loader2 } from 'lucide-react';

import { revealMailboxPasswordAction } from '@/app/admin/mailboxes/actions';
import { Button } from '@/components/ui/button';

/**
 * Shows a mailbox's current password on request.
 *
 * <p>Fetched on the click rather than rendered with the page, so the password
 * is not sitting in the HTML of every mailbox anybody opens, and each
 * disclosure is a request that shows up in trade-service's log.
 *
 * <p>Worth having because the password announced in the admin group when a
 * mailbox is created stops working the moment a trade hands the mailbox over —
 * that handover rotates it, and this is the only thing that shows what it
 * became.
 */
export function MailboxPasswordReveal({ mailboxId }: { mailboxId: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, startLoading] = useTransition();

  function reveal() {
    setError(null);
    startLoading(async () => {
      const result = await revealMailboxPasswordAction(mailboxId);
      if (!result.ok) {
        setError(result.error ?? 'Parolni olib bo‘lmadi');
        return;
      }
      setPassword(result.password ?? null);
    });
  }

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs permission and a secure context. The password is on
      // screen either way, so selecting it by hand still works.
    }
  }

  if (password) {
    return (
      <div className="flex items-center gap-2">
        <code className="rounded-lg bg-muted px-3 py-2 font-mono text-sm font-bold">
          {password}
        </code>
        <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label="Parolni nusxalash">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={reveal} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="mr-2 h-4 w-4" />
        )}
        Parolni ko&apos;rsatish
        {!loading && <Eye className="ml-2 h-3.5 w-3.5 opacity-60" />}
      </Button>
      {error && <span className="text-xs font-semibold text-destructive">{error}</span>}
    </div>
  );
}

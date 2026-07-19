'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/lib/utils';

interface CopyButtonProps {
  /** Text placed on the clipboard. */
  value: string;
  /** Accessible name + tooltip, e.g. "Manzilni nusxalash". */
  label: string;
  /** Optional visible text next to the icon. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * One-tap clipboard copy with a 2s "copied" confirmation. Used for the
 * mailbox address (pasted into Konami forms) and for detected 2FA codes.
 * Falls back to a hidden textarea + execCommand when the async Clipboard API
 * is unavailable (older WebViews).
 */
export function CopyButton({ value, label, children, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied — nothing sensible to do; leave the button as-is.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={label}
      aria-label={copied ? 'Nusxalandi' : label}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors',
        copied
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? <span>Nusxalandi</span> : children}
    </button>
  );
}

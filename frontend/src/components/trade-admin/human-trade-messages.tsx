'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AlertTriangle, Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { buildTradeApiPath } from '@/lib/trade-client-api';
import type {
  TradeMessageResponse,
  TradeMessageSenderType,
  TradeMessageTarget,
} from '@/lib/trade-types';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 5000;

function messageBody(message: TradeMessageResponse) {
  return message.body ?? message.content ?? '';
}

function senderLabel(senderType: TradeMessageSenderType) {
  switch (senderType) {
    case 'HUMAN_ADMIN':
      return 'Inson admin';
    case 'SMART_ADMIN':
      return 'Smart admin';
    case 'SYSTEM':
      return 'Tizim';
    case 'USER':
    default:
      return 'Foydalanuvchi';
  }
}

export function HumanTradeMessages({
  tradeId,
  target,
  title,
  readOnly = false,
}: {
  tradeId: string;
  target?: TradeMessageTarget;
  title: string;
  readOnly?: boolean;
}) {
  const [messages, setMessages] = useState<TradeMessageResponse[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (target) p.set('target', target);
    return p;
  }, [target]);

  const reload = useCallback(async () => {
    const result = await fetchMessages(tradeId, params);
    if (result.ok) {
      setMessages(result.data);
      setError(null);
    } else {
      setError(result.error);
      setMessages((prev) => prev ?? []);
    }
  }, [tradeId, params]);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reload]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    startSend(async () => {
      const result = await postMessage(tradeId, params, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft('');
      setMessages((prev) => mergeMessages(prev ?? [], [result.data]));
      await reload();
    });
  }

  return (
    <section className="flex min-h-[360px] flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <h3 className="text-sm font-black text-foreground">{title}</h3>
          <p className="text-[10.5px] text-muted-foreground">
            {target === 'SELLER' ? 'Sotuvchi bilan alohida chat' : target === 'BUYER' ? 'Xaridor bilan alohida chat' : 'Admin bilan chat'}
          </p>
        </div>
        {messages === null && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </header>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages?.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Hali xabar yo'q.
          </p>
        )}
        {messages?.map((message) => {
          const system = message.senderType === 'SYSTEM' || message.messageType === 'STATUS';
          const humanAdmin = message.senderType === 'HUMAN_ADMIN';
          const text = messageBody(message);

          if (system) {
            return (
              <div key={message.id} className="flex justify-center">
                <span className="rounded-full bg-muted px-3 py-1 text-[10.5px] font-semibold text-muted-foreground">
                  {text || message.code || 'Status yangilandi'}
                </span>
              </div>
            );
          }

          return (
            <div
              key={message.id}
              className={cn('flex', humanAdmin ? 'justify-start' : 'justify-end')}
            >
              <div
                className={cn(
                  'max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                  humanAdmin
                    ? 'rounded-bl-md border border-primary/25 bg-primary/5 text-foreground'
                    : 'rounded-br-md bg-primary text-primary-foreground',
                )}
              >
                <p
                  className={cn(
                    'mb-0.5 text-[10px] font-bold uppercase tracking-wide',
                    humanAdmin ? 'text-primary' : 'text-primary-foreground/70',
                  )}
                >
                  {senderLabel(message.senderType)}
                </p>
                <p className="whitespace-pre-wrap break-words">{text}</p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {readOnly ? (
        <div className="border-t border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
          Chat yopilgan.
        </div>
      ) : (
        <div className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Xabar yozing..."
            className="min-h-11"
            disabled={sending}
          />
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={send}
            disabled={sending || !draft.trim()}
            aria-label="Xabar yuborish"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </section>
  );
}

function mergeMessages(prev: TradeMessageResponse[], next: TradeMessageResponse[]) {
  const map = new Map<string, TradeMessageResponse>();
  for (const message of prev) map.set(message.id, message);
  for (const message of next) map.set(message.id, message);
  return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function fetchMessages(
  tradeId: string,
  params: URLSearchParams,
): Promise<{ ok: true; data: TradeMessageResponse[] } | { ok: false; error: string }> {
  try {
    const response = await fetch(
      buildTradeApiPath(['v1', 'trades', tradeId, 'messages'], params),
      { credentials: 'include', headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return { ok: false, error: "Xabarlar yuklanmadi" };
    return { ok: true, data: (await response.json()) as TradeMessageResponse[] };
  } catch {
    return { ok: false, error: "Xabarlar yuklanmadi" };
  }
}

async function postMessage(
  tradeId: string,
  params: URLSearchParams,
  text: string,
): Promise<{ ok: true; data: TradeMessageResponse } | { ok: false; error: string }> {
  try {
    const response = await fetch(
      buildTradeApiPath(['v1', 'trades', tradeId, 'messages'], params),
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body: text, content: text }),
      },
    );
    if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
    return { ok: true, data: (await response.json()) as TradeMessageResponse };
  } catch {
    return { ok: false, error: 'Xabar yuborilmadi' };
  }
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.error === 'string') return payload.error;
  } catch {
    // ignore
  }
  return response.status === 401 || response.status === 403
    ? 'Kirish talab qilinadi'
    : "So'rov bajarilmadi";
}

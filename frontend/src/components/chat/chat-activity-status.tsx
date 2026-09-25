'use client';

import { Check, CheckCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChatActivity } from '@/hooks/use-chat-activity';
import { formatDayLabel, formatLastSeen, formatMessageTime } from '@/lib/chat-format';

function LastSeenStatus({ lastSeen }: { lastSeen: string | null }) {
  const [now, setNow] = useState(() => new Date());
  const valid = !!lastSeen && Number.isFinite(Date.parse(lastSeen));
  useEffect(() => {
    if (!valid) return;
    // Only refresh the label locally; presence still arrives over WebSocket.
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [valid]);
  return <span title={valid ? `Oxirgi faollik: ${formatDayLabel(lastSeen, now)} ${formatMessageTime(lastSeen)}` : undefined}>
    {formatLastSeen(lastSeen, now)}
  </span>;
}

export function ChatActivityStatus({ activity }: { activity: ChatActivity | null }) {
  const state = activity?.typing ? 'typing' : activity?.online ? 'online' : activity ? 'offline' : 'unknown';
  const lastSeen = activity?.lastSeenAt ?? null;
  return (
    <span className="chat-activity-status mt-0.5 flex min-h-4 items-center gap-1.5 text-xs" data-state={state}>
      <span key={state} className="chat-status-transition inline-flex items-center gap-1.5">
        {state === 'typing' ? <>
          <span className="inline-flex items-center gap-0.5" aria-hidden="true">
            <i className="chat-typing-dot" /><i className="chat-typing-dot" /><i className="chat-typing-dot" />
          </span>
          yozmoqda…
        </> : state === 'online' ? <><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />Onlayn</>
          : state === 'offline' ? <LastSeenStatus key={lastSeen} lastSeen={lastSeen} />
            : 'Savdo suhbati'}
      </span>
    </span>
  );
}

export function MessageReadReceipt({ createdAt, lastReadAt }: { createdAt: string; lastReadAt: string | null }) {
  const read = !!lastReadAt && Date.parse(createdAt) <= Date.parse(lastReadAt);
  const label = read ? 'O‘qilgan' : 'Yuborilgan';
  const Icon = read ? CheckCheck : Check;
  return <span role="img" aria-label={label} title={label} className="chat-read-receipt inline-flex" data-read={read}>
    <Icon key={String(read)} className="chat-status-transition h-3.5 w-3.5" aria-hidden="true" />
  </span>;
}

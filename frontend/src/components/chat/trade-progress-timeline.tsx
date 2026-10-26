import { Check, Circle, Clock3, X } from 'lucide-react';
import { formatDayLabel, formatMessageTime } from '@/lib/chat-format';
import { tradeTimeline, type TimelineStatus } from '@/lib/trade-timeline';
import type { TradeKind, TradeMode, TradeResponse } from '@/lib/trade-types';

const appearance = {
  passed: { color: 'border-success-border bg-success-soft text-success', text: 'text-success', label: 'Bajarildi', Icon: Check },
  current: { color: 'border-warning-border bg-warning-soft text-warning', text: 'text-warning', label: 'Jarayonda', Icon: Clock3 },
  failed: { color: 'border-destructive/30 bg-destructive/10 text-destructive', text: 'text-destructive', label: 'To‘xtatildi', Icon: X },
  next: { color: 'border-border bg-muted text-muted-foreground', text: 'text-muted-foreground', label: 'Keyingi bosqich', Icon: Circle },
  unknown: { color: 'border-border bg-muted text-muted-foreground', text: 'text-muted-foreground', label: 'Ma’lumot mavjud emas', Icon: Circle },
} satisfies Record<TimelineStatus, unknown>;

export function TradeProgressTimeline({ outcome, trade, kind, mode, createdAt, tradeCreatedAt, isProposalSender = false }: {
  outcome: Parameters<typeof tradeTimeline>[0];
  trade?: TradeResponse | null;
  kind?: TradeKind;
  mode?: TradeMode;
  createdAt?: string;
  tradeCreatedAt?: string;
  isProposalSender?: boolean;
}) {
  const steps = tradeTimeline(outcome, trade, kind, mode);
  return (
    <section aria-label="Savdo bosqichlari">
      <h3 className="mb-4 text-sm font-semibold">Savdo bosqichlari</h3>
      <ol>
        {steps.map((step, index) => {
          const { Icon, color, text, label } = appearance[step.status];
          const timestamp = step.id === 'SENT' ? createdAt : step.id === 'INITIATED' ? tradeCreatedAt : step.id === 'SUCCESS' && step.status === 'passed' ? trade?.completedAt : null;
          return (
            <li key={step.id} aria-current={step.status === 'current' ? 'step' : undefined}
              data-step={step.id} data-status={step.status} className="relative flex gap-3 pb-5 last:pb-0">
              {index < steps.length - 1 && <span aria-hidden="true" className={`absolute bottom-0 left-3 top-6 w-0.5 -translate-x-1/2 ${step.status === 'passed' && steps[index + 1].status === 'passed' ? 'bg-success' : 'bg-border'}`} />}
              <span aria-hidden="true" className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${color}`}><Icon className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${text}`}>
                  {isProposalSender && step.id === 'ACCEPTED' && step.status === 'current' ? 'Javob kutilmoqda' : step.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                {timestamp && <time dateTime={timestamp} className="mt-0.5 block text-xs text-muted-foreground">{formatDayLabel(timestamp)} · {formatMessageTime(timestamp)}</time>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

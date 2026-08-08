'use client';

import { useMemo, useState, useTransition } from 'react';
import { CheckCircle2, Circle, Loader2, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { humanStepCompletion } from '@/lib/trade-human';
import type { TradeStep, TradeStepResponse } from '@/lib/trade-types';
import { cn } from '@/lib/utils';

export function HumanTradeChecklist({
  steps,
  editable = false,
  disabled = false,
  onMark,
  onUnmark,
}: {
  steps: TradeStepResponse[];
  editable?: boolean;
  disabled?: boolean;
  onMark?: (step: TradeStep, note?: string) => Promise<void>;
  onUnmark?: (step: TradeStep) => Promise<void>;
}) {
  const completion = useMemo(() => humanStepCompletion(steps), [steps]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyStep, setBusyStep] = useState<TradeStep | null>(null);
  const [pending, startTransition] = useTransition();

  function mark(step: TradeStep) {
    if (!onMark) return;
    setBusyStep(step);
    startTransition(async () => {
      try {
        await onMark(step, notes[step]?.trim() || undefined);
        setNotes((prev) => ({ ...prev, [step]: '' }));
      } finally {
        setBusyStep(null);
      }
    });
  }

  function unmark(step: TradeStep) {
    if (!onUnmark) return;
    setBusyStep(step);
    startTransition(async () => {
      try {
        await onUnmark(step);
      } finally {
        setBusyStep(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-foreground">Admin checklist</p>
          <p className="text-xs text-muted-foreground">
            {completion.completed}/{completion.total} qadam bajarilgan
          </p>
        </div>
        <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{
              width: completion.total ? `${(completion.completed / completion.total) * 100}%` : '0%',
            }}
          />
        </div>
      </div>

      <ol className="space-y-2">
        {steps.map((step) => {
          const busy = pending && busyStep === step.step;
          return (
            <li
              key={step.step}
              className={cn(
                'rounded-lg border p-3',
                step.completed
                  ? 'border-primary/25 bg-primary/5'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full',
                    step.completed ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {step.completed ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{step.labelUz}</p>
                  {step.note && (
                    <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                      {step.note}
                    </p>
                  )}
                </div>
              </div>

              {editable && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  {!step.completed && (
                    <Input
                      value={notes[step.step] ?? ''}
                      onChange={(event) =>
                        setNotes((prev) => ({ ...prev, [step.step]: event.target.value }))
                      }
                      placeholder="Izoh (ixtiyoriy)"
                      maxLength={500}
                      disabled={disabled || busy}
                      className="h-9"
                    />
                  )}
                  {step.completed ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled || busy}
                      onClick={() => unmark(step.step)}
                      className="shrink-0"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      Bekor qilish
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={disabled || busy}
                      onClick={() => mark(step.step)}
                      className="shrink-0"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      Belgilash
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

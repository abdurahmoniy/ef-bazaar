'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fromEntitlementValue,
  isReduction,
  toEntitlementValue,
  updatePlanEntitlements,
  type PlanEntitlementRow,
  type SlotDraft,
} from '@/lib/plans-admin';
import { CUSTOM_SLOTS_KEY, PLAN_NAMES, SLOTS_KEY, type PlanCode } from '@/lib/plans';

const PLANS: PlanCode[] = ['STANDARD', 'PRO'];
const COLUMNS = [
  { key: SLOTS_KEY, label: 'Jami qutilar', aria: 'jami qutilar' },
  { key: CUSTOM_SLOTS_KEY, label: 'Shundan yangi shaxsiy qutilar', aria: 'shaxsiy qutilar' },
];
const cell = (c: PlanCode, k: string) => `${c}|${k}`;

type Items = { planCode: PlanCode; key: string; value: string | null }[];

function baselineOf(rows: PlanEntitlementRow[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const c of PLANS) for (const col of COLUMNS) out[cell(c, col.key)] = '0';
  for (const r of rows) out[cell(r.planCode, r.key)] = r.value;
  return out;
}

type Draft = SlotDraft & { lastFinite?: string };

function draftsOf(base: Record<string, string | null>): Record<string, Draft> {
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, fromEntitlementValue(v)]));
}

export function AdminPlanMailboxes({ initial }: { initial: PlanEntitlementRow[] }) {
  const [base, setBase] = useState(() => baselineOf(initial));
  const [drafts, setDrafts] = useState(() => draftsOf(base));
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Items | null>(null);

  function patch(id: string, next: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...next } }));
  }

  /** Unticking "Cheksiz" brings back the last finite value (typed or saved), else 0. */
  function toggleUnlimited(id: string, unlimited: boolean) {
    setDrafts((d) => {
      const cur = d[id];
      if (unlimited) {
        const lastFinite = cur.count !== '' ? cur.count : cur.lastFinite;
        return { ...d, [id]: { unlimited: true, count: '', lastFinite } };
      }
      return { ...d, [id]: { unlimited: false, count: cur.lastFinite ?? base[id] ?? '0' } };
    });
  }

  async function commit(items: Items) {
    setSaving(true);
    try {
      const updated = await updatePlanEntitlements(items);
      const nextBase = baselineOf(updated);
      setBase(nextBase);
      setDrafts(draftsOf(nextBase));
      toast.success('Limitlar saqlandi');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
      setPending(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    let items: Items;
    try {
      items = PLANS.flatMap((planCode) =>
        COLUMNS.map((col) => ({
          planCode,
          key: col.key,
          value: toEntitlementValue(drafts[cell(planCode, col.key)]),
        })),
      );
    } catch (err) {
      toast.error((err as Error).message);
      return;
    }
    if (items.some((i) => isReduction(base[cell(i.planCode, i.key)], i.value))) {
      setPending(items);
      return;
    }
    void commit(items);
  }

  const totalReduction = pending?.some((i) => i.key === SLOTS_KEY && isReduction(base[cell(i.planCode, i.key)], i.value)) ?? false;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground">
        <div className="hidden grid-cols-[1.2fr_1fr_1fr] bg-muted px-5 py-3 text-xs font-bold text-muted-foreground md:grid">
          <span>Tarif</span>
          {COLUMNS.map((c) => <span key={c.key}>{c.label}</span>)}
        </div>
        {PLANS.map((code) => (
          <div key={code} className="grid items-center gap-3 border-t border-border px-5 py-4 first:border-t-0 md:grid-cols-[1.2fr_1fr_1fr]">
            <span className="font-extrabold">
              {PLAN_NAMES[code]} <span className="text-xs font-semibold text-muted-foreground">{code}</span>
            </span>
            {COLUMNS.map((col) => {
              const id = cell(code, col.key);
              const d = drafts[id];
              return (
                <div key={col.key} className="flex items-center gap-3">
                  <Input
                    type="text"
                    inputMode="numeric"
                    aria-label={`${PLAN_NAMES[code]} ${col.aria}`}
                    value={d.unlimited ? '' : d.count}
                    disabled={d.unlimited || saving}
                    onChange={(e) => patch(id, { count: e.target.value })}
                    className="h-11 w-20 font-bold"
                  />
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="size-[18px] accent-primary"
                      checked={d.unlimited}
                      disabled={saving}
                      onChange={(e) => toggleUnlimited(id, e.target.checked)}
                      aria-label={`${PLAN_NAMES[code]} ${col.aria} cheksiz`}
                    />
                    Cheksiz
                  </label>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <div role="note" className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-relaxed text-foreground">
        <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-destructive" aria-hidden />
        <span>
          Jami limit kamaytirilsa ortiqcha qutilar qulflanishi mumkin; faol savdo va limitdan tashqari qutilar himoyalangan. Custom chegarasi faqat yangi nomli quti yaratishga ta’sir qiladi; mavjud qutilarni o‘qish umumiy limit bo‘yicha saqlanadi.
        </span>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? 'Saqlanmoqda…' : 'Slotlarni saqlash'}
        </Button>
      </div>

      <Dialog.Root open={pending !== null} onOpenChange={(open) => { if (!open && !saving) setPending(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/45" />
          <Dialog.Content
            onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }}
            onPointerDownOutside={(e) => { if (saving) e.preventDefault(); }}
            onInteractOutside={(e) => { if (saving) e.preventDefault(); }}
            className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
          >
            <Dialog.Title className="text-lg font-extrabold">Limitni kamaytirasizmi?</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              {totalReduction
                ? 'Jami limitdan ortiq qutilar qulflanishi mumkin. Faol savdo va limitdan tashqari qutilar himoyalangan. Davom etasizmi?'
                : 'Yangi nomli quti olish chegarasi kamayadi. Mavjud qutilarni o‘qish umumiy limit bo‘yicha saqlanadi. Davom etasizmi?'}
            </Dialog.Description>
            <div className="grid grid-cols-2 gap-2.5">
              <Button type="button" variant="outline" size="lg" disabled={saving} onClick={() => setPending(null)}>
                Bekor qilish
              </Button>
              <Button type="button" size="lg" disabled={saving} onClick={() => pending && void commit(pending)}>
                {saving ? 'Kuting…' : 'Davom etish'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  );
}

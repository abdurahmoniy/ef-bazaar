'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { UserPicker } from '@/components/admin/user-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatTiyin } from '@/lib/money';
import {
  assignPlan,
  parseSomInput,
  updatePlanPrices,
  type PlanPriceRow,
} from '@/lib/plans-admin';
import { PLAN_NAMES, yearlySavingsPercent, type PlanCode, type PlanPeriod } from '@/lib/plans';
import type { FoundUser } from '@/lib/user-search';

const PAID: PlanCode[] = ['PRO', 'MAX'];
const key = (c: PlanCode, p: PlanPeriod) => `${c}:${p}`;

function toDrafts(rows: PlanPriceRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [key(r.planCode, r.period), formatTiyin(r.priceTiyin)]));
}

function lastChange(rows: PlanPriceRow[], code: PlanCode): string | null {
  const mine = rows.filter((r) => r.planCode === code);
  if (mine.length === 0) return null;
  const latest = mine.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b));
  const when = new Date(latest.updatedAt).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  return `${latest.updatedBy ?? '—'} · ${when}`;
}

export function AdminPlanPrices({ initial }: { initial: PlanPriceRow[] }) {
  const [rows, setRows] = useState(initial);
  const [drafts, setDrafts] = useState(() => toDrafts(initial));
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let items;
    try {
      items = PAID.flatMap((code) =>
        (['MONTH', 'YEAR'] as PlanPeriod[]).map((period) => ({
          planCode: code,
          period,
          priceTiyin: parseSomInput(drafts[key(code, period)] ?? ''),
        })),
      );
    } catch (err) {
      toast.error((err as Error).message);
      return;
    }
    setSaving(true);
    try {
      const updated = await updatePlanPrices(items);
      setRows(updated);
      setDrafts(toDrafts(updated));
      toast.success('Narxlar saqlandi');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {PAID.map((code) => {
            const saving_ = yearlySavingsPercent({
              MONTH: rows.find((r) => r.planCode === code && r.period === 'MONTH')?.priceTiyin,
              YEAR: rows.find((r) => r.planCode === code && r.period === 'YEAR')?.priceTiyin,
            });
            const changed = lastChange(rows, code);
            return (
              <section key={code} className="space-y-4 rounded-2xl border border-border bg-card p-5 text-card-foreground">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold">
                    {PLAN_NAMES[code]} <span className="text-xs font-semibold text-muted-foreground">{code}</span>
                  </h2>
                  {saving_ !== null && (
                    <span className="rounded-full bg-secondary/25 px-2.5 py-1 text-xs font-bold text-secondary-foreground dark:text-secondary">
                      Yillikda −{saving_}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(['MONTH', 'YEAR'] as PlanPeriod[]).map((period) => {
                    const id = `price-${code}-${period}`;
                    return (
                      <div key={period} className="space-y-1.5">
                        <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
                          {period === 'MONTH' ? 'Oylik narx, so‘m' : 'Yillik narx, so‘m'}
                        </Label>
                        <Input
                          id={id}
                          type="text"
                          inputMode="numeric"
                          value={drafts[key(code, period)] ?? ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [key(code, period)]: e.target.value }))}
                          disabled={saving}
                          className="h-11 font-bold"
                        />
                      </div>
                    );
                  })}
                </div>
                {changed && <p className="text-xs text-muted-foreground">Oxirgi o‘zgartirish: {changed}</p>}
              </section>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? 'Saqlanmoqda…' : 'Narxlarni saqlash'}
          </Button>
        </div>
      </form>
      <AssignPlanForm />
    </div>
  );
}

function AssignPlanForm() {
  const [user, setUser] = useState<FoundUser | null>(null);
  const [typed, setTyped] = useState('');
  const [plan, setPlan] = useState<PlanCode>('PRO');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  // A pasted UUID is accepted without picking from the list.
  const userId = user?.id ?? (/^[0-9a-f-]{36}$/i.test(typed.trim()) ? typed.trim() : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      toast.error('Foydalanuvchini tanlang yoki UUID kiriting');
      return;
    }
    setBusy(true);
    try {
      await assignPlan({
        userId,
        planCode: plan,
        expiresAt: date ? new Date(`${date}T23:59:59+05:00`).toISOString() : null,
        source: 'ADMIN',
      });
      toast.success(`${PLAN_NAMES[plan]} tarifi berildi`);
      setUser(null);
      setTyped('');
      setDate('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5 text-card-foreground">
      <h2 className="text-base font-extrabold">Foydalanuvchiga tarif berish</h2>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="assign-user" className="text-xs font-semibold text-muted-foreground">
            Foydalanuvchi
          </Label>
          <UserPicker inputId="assign-user" selected={user} onChange={setUser} onQueryChange={setTyped} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assign-plan" className="text-xs font-semibold text-muted-foreground">Tarif</Label>
          <Select id="assign-plan" value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)} className="h-11">
            {(['PRO', 'MAX', 'STANDARD'] as PlanCode[]).map((c) => (
              <option key={c} value={c}>{PLAN_NAMES[c]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assign-date" className="text-xs font-semibold text-muted-foreground">
            Tugash sanasi (ixtiyoriy)
          </Label>
          <Input id="assign-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
        </div>
      </div>
      <Button type="submit" variant="outline" size="lg" disabled={busy}>
        {busy ? 'Kuting…' : 'Tarif berish'}
      </Button>
    </form>
  );
}

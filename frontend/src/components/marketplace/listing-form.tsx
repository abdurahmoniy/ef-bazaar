'use client';

import { useActionState } from 'react';
import { AlertCircle } from 'lucide-react';

import { createListingAction, type ListingFormState } from '@/app/marketplace/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const INITIAL_STATE: ListingFormState = { ok: false };

export function ListingForm() {
  const [state, formAction, pending] = useActionState(createListingAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="flex items-start gap-2 rounded-[8px] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <Field label="Tavsif">
        <textarea
          name="description"
          required
          minLength={10}
          rows={5}
          className="min-h-32 w-full rounded-[8px] border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-cyber-cyan/50 focus:ring-2 focus:ring-cyber-cyan/40"
          placeholder="Akkount holati, muhim playerlar, platforma..."
        />
      </Field>

      <Field label="Muhim playerlar">
        <Input name="valuablePlayers" className="rounded-[8px]" placeholder="Messi, Neymar, Mbappe" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Division">
          <Input name="highestDivisionLevel" type="number" min={1} max={9} required className="rounded-[8px]" />
        </Field>
        <Field label="Team strength">
          <Input name="teamStrength" type="number" min={0} required className="rounded-[8px]" />
        </Field>
        <Field label="Android coins">
          <Input name="androidCoins" type="number" min={0} defaultValue={0} required className="rounded-[8px]" />
        </Field>
        <Field label="iOS coins">
          <Input name="iosCoins" type="number" min={0} defaultValue={0} required className="rounded-[8px]" />
        </Field>
        <Field label="Narx">
          <Input name="price" type="number" min={0} required className="rounded-[8px]" />
        </Field>
      </div>

      <div className="grid gap-2 rounded-[8px] border border-white/10 bg-white/[0.04] p-3 text-sm">
        <label className="flex items-center gap-2">
          <input name="hasGooglePlayLink" type="checkbox" className="h-4 w-4 accent-cyber-cyan" />
          Google Play link bor
        </label>
        <label className="flex items-center gap-2">
          <input name="priceNegotiable" type="checkbox" className="h-4 w-4 accent-cyber-cyan" />
          Savdolashish mumkin
        </label>
      </div>

      <Button type="submit" disabled={pending} className="h-11 w-full rounded-[8px]">
        {pending ? 'Yaratilmoqda...' : "E'lon yaratish"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle } from 'lucide-react';

import { createListingAction, type ListingFormState } from '@/app/marketplace/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buildDebugMarketplaceApiPath } from '@/lib/debug-visible-api';
import { createListingRequestFromForm } from '@/lib/listing-form-data';
import type { ListingResponse } from '@/lib/marketplace-types';

const INITIAL_STATE: ListingFormState = { ok: false };
const LOGIN_REQUIRED_MESSAGE = 'Telegram orqali kirish kerak';

interface ListingFormProps {
  visibleApiDebug?: boolean;
}

export function ListingForm({ visibleApiDebug = false }: ListingFormProps) {
  const router = useRouter();
  const [actionState, formAction, actionPending] = useActionState(createListingAction, INITIAL_STATE);
  const [debugState, setDebugState] = useState<ListingFormState>(INITIAL_STATE);
  const [debugPending, setDebugPending] = useState(false);

  const state = visibleApiDebug ? debugState : actionState;
  const pending = visibleApiDebug ? debugPending : actionPending;

  async function handleDebugSubmit(event: FormEvent<HTMLFormElement>) {
    if (!visibleApiDebug) return;

    event.preventDefault();
    setDebugPending(true);
    setDebugState(INITIAL_STATE);

    const request = createListingRequestFromForm(new FormData(event.currentTarget));
    if (typeof request === 'string') {
      setDebugState({ ok: false, error: request });
      setDebugPending(false);
      return;
    }

    try {
      const response = await fetch(buildDebugMarketplaceApiPath('v1/listings'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(request),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setDebugState({
          ok: false,
          error: response.status === 401 || response.status === 403
            ? LOGIN_REQUIRED_MESSAGE
            : errorMessageFromPayload(payload, "E'lon yaratilmadi"),
          code: codeFromPayload(payload),
        });
        return;
      }

      const listingId = listingIdFromPayload(payload);
      if (!listingId) {
        setDebugState({ ok: false, error: "E'lon yaratildi, lekin ID qaytmadi" });
        return;
      }

      router.push(`/marketplace/${listingId}`);
      router.refresh();
    } catch {
      setDebugState({ ok: false, error: "E'lon yaratilmadi" });
    } finally {
      setDebugPending(false);
    }
  }

  return (
    <form
      action={visibleApiDebug ? undefined : formAction}
      className="space-y-4"
      onSubmit={visibleApiDebug ? handleDebugSubmit : undefined}
    >
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

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null;
}

function errorMessageFromPayload(payload: unknown, fallback: string) {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  return fallback;
}

function codeFromPayload(payload: unknown) {
  if (!isRecord(payload)) return undefined;
  return typeof payload.code === 'string' ? payload.code : undefined;
}

function listingIdFromPayload(payload: unknown) {
  if (!isRecord(payload)) return null;
  return typeof (payload as Partial<ListingResponse>).id === 'string'
    ? (payload as Partial<ListingResponse>).id
    : null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

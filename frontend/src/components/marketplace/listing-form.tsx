'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  buildAttributeFieldName,
  collectListingFiles,
  createListingRequestFromForm,
  SEEDED_LISTING_ATTRIBUTE_DEFINITIONS,
} from '@/lib/listing-form-data';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import type {
  AttributeType,
  ListingAttributeDefinition,
  ListingResponse,
} from '@/lib/marketplace-types';

interface ListingFormState {
  ok: boolean;
  error?: string;
  code?: string;
}

const INITIAL_STATE: ListingFormState = { ok: false };
const LOGIN_REQUIRED_MESSAGE = 'Telegram orqali kirish kerak';
const MIN_FILES = 1;
const MAX_FILES = 10;

export function ListingForm() {
  const router = useRouter();
  const [state, setState] = useState<ListingFormState>(INITIAL_STATE);
  const [pending, setPending] = useState(false);
  const [attributeDefinitions, setAttributeDefinitions] = useState<readonly ListingAttributeDefinition[]>(
    SEEDED_LISTING_ATTRIBUTE_DEFINITIONS,
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadAttributeDefinitions() {
      try {
        const response = await fetch(buildMarketplaceApiPath('v1/attributes'), {
          headers: { Accept: 'application/json' },
          credentials: 'include',
          signal: controller.signal,
        });
        const payload = await readJson(response);
        const definitions = normalizeAttributeDefinitions(payload);

        if (response.ok && definitions.length > 0) {
          setAttributeDefinitions(definitions);
        }
      } catch (loadError) {
        if ((loadError as Error).name !== 'AbortError') {
          setAttributeDefinitions(SEEDED_LISTING_ATTRIBUTE_DEFINITIONS);
        }
      }
    }

    void loadAttributeDefinitions();
    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState(INITIAL_STATE);

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const request = createListingRequestFromForm(formData, attributeDefinitions);
    if (typeof request === 'string') {
      setState({ ok: false, error: request });
      setPending(false);
      return;
    }
    const files = collectListingFiles(formData);
    if (files.length < MIN_FILES || files.length > MAX_FILES) {
      setState({
        ok: false,
        error: `Rasm soni ${MIN_FILES} tadan ${MAX_FILES} tagacha bo'lishi kerak`,
      });
      setPending(false);
      return;
    }

    const multipart = new FormData();
    multipart.append(
      'data',
      new Blob([JSON.stringify(request)], { type: 'application/json' }),
    );
    for (const file of files) multipart.append('files', file);

    try {
      const response = await fetch(buildMarketplaceApiPath('v1/listings'), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        body: multipart,
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setState({
          ok: false,
          error:
            response.status === 401 || response.status === 403
              ? LOGIN_REQUIRED_MESSAGE
              : errorMessageFromPayload(payload, "E'lon yaratilmadi"),
          code: codeFromPayload(payload),
        });
        return;
      }

      const listingId = listingIdFromPayload(payload);
      if (!listingId) {
        setState({ ok: false, error: "E'lon yaratildi, lekin ID qaytmadi" });
        return;
      }

      router.push(`/marketplace/${listingId}`);
      router.refresh();
    } catch {
      setState({ ok: false, error: "E'lon yaratilmadi" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {state.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
          className="min-h-32 w-full rounded-lg border border-input bg-white px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/40"
          placeholder="Akkount holati, muhim playerlar, platforma..."
        />
      </Field>

      <DynamicAttributeFields definitions={attributeDefinitions} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Narx">
          <Input name="price" type="number" min={0} required className="rounded-lg" />
        </Field>
      </div>

      <BooleanAttributeFields definitions={attributeDefinitions} />

      <div className="grid gap-2 rounded-lg border border-border bg-muted/60 p-3 text-sm">
        <label className="flex items-center gap-2">
          <input name="priceNegotiable" type="checkbox" className="h-4 w-4 accent-primary" />
          Savdolashish mumkin
        </label>
      </div>

      <Field label={`Rasmlar (${MIN_FILES}–${MAX_FILES} ta, JPG/PNG/WebP/HEIC)`}>
        <input
          name="files"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          required
          className="block w-full cursor-pointer rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-accent-foreground hover:file:bg-accent/80"
        />
      </Field>

      <Button type="submit" disabled={pending} className="h-11 w-full rounded-lg">
        {pending ? 'Yaratilmoqda...' : "E'lon yaratish"}
      </Button>
    </form>
  );
}

function DynamicAttributeFields({
  definitions,
}: {
  definitions: readonly ListingAttributeDefinition[];
}) {
  const fields = sortedActiveDefinitions(definitions).filter(
    (definition) => definition.type !== 'BOOLEAN',
  );

  if (fields.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((definition) => (
        <AttributeField key={definition.key} definition={definition} />
      ))}
    </div>
  );
}

function BooleanAttributeFields({
  definitions,
}: {
  definitions: readonly ListingAttributeDefinition[];
}) {
  const fields = sortedActiveDefinitions(definitions).filter(
    (definition) => definition.type === 'BOOLEAN',
  );

  if (fields.length === 0) return null;

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/60 p-3 text-sm">
      {fields.map((definition) => (
        <label key={definition.key} className="flex items-center gap-2">
          <input
            name={buildAttributeFieldName(definition.key)}
            type="checkbox"
            className="h-4 w-4 accent-primary"
          />
          {definition.labelUz}
        </label>
      ))}
    </div>
  );
}

function AttributeField({ definition }: { definition: ListingAttributeDefinition }) {
  const name = buildAttributeFieldName(definition.key);
  const commonInputClass = 'rounded-lg';

  if (definition.type === 'TEXT') {
    return (
      <div className="space-y-2 sm:col-span-2">
        <Label>{definition.labelUz}</Label>
        <textarea
          name={name}
          required={definition.required}
          maxLength={numberConstraint(definition, 'max_length')}
          rows={4}
          className="min-h-28 w-full rounded-lg border border-input bg-white px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
      </div>
    );
  }

  if (definition.type === 'ENUM') {
    const options = stringListConstraint(definition, 'options');
    return (
      <Field label={definition.labelUz}>
        <select
          name={name}
          required={definition.required}
          defaultValue=""
          className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/40"
        >
          <option value="" disabled>
            Tanlang
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (definition.type === 'LIST_STRING') {
    return (
      <Field label={definition.labelUz}>
        <Input
          name={name}
          required={definition.required}
          maxLength={numberConstraint(definition, 'max_length')}
          className={commonInputClass}
          placeholder={definition.key === 'valuable_players' ? 'Messi, Neymar, Mbappe' : undefined}
        />
      </Field>
    );
  }

  if (definition.type === 'INT' || definition.type === 'DECIMAL') {
    return (
      <Field label={definition.labelUz}>
        <Input
          name={name}
          type="number"
          min={numberConstraint(definition, 'min')}
          max={numberConstraint(definition, 'max')}
          step={definition.type === 'DECIMAL' ? '0.01' : '1'}
          required={definition.required}
          className={commonInputClass}
          defaultValue={defaultNumberValue(definition)}
        />
      </Field>
    );
  }

  return (
    <Field label={definition.labelUz}>
      <Input
        name={name}
        required={definition.required}
        maxLength={numberConstraint(definition, 'max_length')}
        className={commonInputClass}
      />
    </Field>
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

function normalizeAttributeDefinitions(payload: unknown): ListingAttributeDefinition[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter(isAttributeDefinition).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function isAttributeDefinition(payload: unknown): payload is ListingAttributeDefinition {
  if (!isRecord(payload)) return false;
  return (
    typeof payload.key === 'string' &&
    typeof payload.labelUz === 'string' &&
    isAttributeType(payload.type) &&
    typeof payload.required === 'boolean'
  );
}

function isAttributeType(value: unknown): value is AttributeType {
  return (
    value === 'INT' ||
    value === 'DECIMAL' ||
    value === 'BOOLEAN' ||
    value === 'STRING' ||
    value === 'TEXT' ||
    value === 'LIST_STRING' ||
    value === 'ENUM'
  );
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

function sortedActiveDefinitions(definitions: readonly ListingAttributeDefinition[]) {
  return definitions
    .filter((definition) => definition.active !== false)
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function numberConstraint(definition: ListingAttributeDefinition, key: string) {
  const raw = definition.constraints?.[key];
  const value = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

function stringListConstraint(definition: ListingAttributeDefinition, key: string) {
  const raw = definition.constraints?.[key];
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
}

function defaultNumberValue(definition: ListingAttributeDefinition) {
  const min = numberConstraint(definition, 'min');
  return min === 0 && definition.key.endsWith('_coins') ? 0 : undefined;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

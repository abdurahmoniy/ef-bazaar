'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  adminCreateAttribute,
  adminDeleteAttribute,
  adminUpdateAttribute,
} from '@/lib/marketplace-actions';
import type {
  AttributeDefinitionResponse,
  AttributeType,
} from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface AdminAttributesProps {
  definitions: AttributeDefinitionResponse[];
}

const TYPES: AttributeType[] = [
  'INT',
  'DECIMAL',
  'BOOLEAN',
  'STRING',
  'TEXT',
  'LIST_STRING',
  'ENUM',
  'CARD_LIST',
];

interface FormState {
  key: string;
  labelUz: string;
  type: AttributeType;
  required: boolean;
  searchable: boolean;
  active: boolean;
  position: string;
  groupKey: string;
  constraints: string;
}

const EMPTY_FORM: FormState = {
  key: '',
  labelUz: '',
  type: 'STRING',
  required: false,
  searchable: false,
  active: true,
  position: '0',
  groupKey: '',
  constraints: '',
};

function toForm(def: AttributeDefinitionResponse): FormState {
  return {
    key: def.key,
    labelUz: def.labelUz,
    type: def.type,
    required: def.required,
    searchable: def.searchable,
    active: def.active,
    position: String(def.position),
    groupKey: def.groupKey ?? '',
    constraints: def.constraints ? JSON.stringify(def.constraints, null, 2) : '',
  };
}

export function AdminAttributes({ definitions }: AdminAttributesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // null — closed; 'new' — create form; otherwise the id being edited.
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  function open(target: 'new' | AttributeDefinitionResponse) {
    setError(null);
    if (target === 'new') {
      setForm(EMPTY_FORM);
      setOpenForm('new');
    } else {
      setForm(toForm(target));
      setOpenForm(target.id);
    }
  }

  function close() {
    setOpenForm(null);
    setError(null);
  }

  function submit() {
    let constraints: unknown;
    if (form.constraints.trim()) {
      try {
        constraints = JSON.parse(form.constraints);
      } catch {
        setError("Constraints maydoni yaroqli JSON emas");
        return;
      }
    }
    const common = {
      labelUz: form.labelUz.trim(),
      type: form.type,
      required: form.required,
      position: Number.parseInt(form.position, 10) || 0,
      groupKey: form.groupKey.trim() || null,
      constraints,
      searchable: form.searchable,
    };
    setError(null);
    startTransition(async () => {
      const result =
        openForm === 'new'
          ? await adminCreateAttribute({ ...common, key: form.key.trim() })
          : await adminUpdateAttribute(openForm as string, { ...common, active: form.active });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  function remove(def: AttributeDefinitionResponse) {
    if (!window.confirm(`"${def.labelUz}" atributi deaktivatsiya qilinsinmi?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await adminDeleteAttribute(def.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  const editor = (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {openForm === 'new' && (
          <div className="space-y-1.5">
            <Label htmlFor="attr-key">Key (o&apos;zgarmas)</Label>
            <Input
              id="attr-key"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="masalan: team_strength"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="attr-label">Nomi (UZ)</Label>
          <Input
            id="attr-label"
            value={form.labelUz}
            onChange={(e) => setForm({ ...form, labelUz: e.target.value })}
            placeholder="masalan: Jamoa kuchi"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attr-type">Turi</Label>
          <select
            id="attr-type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as AttributeType })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attr-position">Pozitsiya</Label>
          <Input
            id="attr-position"
            type="number"
            min={0}
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attr-group">Guruh (ixtiyoriy)</Label>
          <Input
            id="attr-group"
            value={form.groupKey}
            onChange={(e) => setForm({ ...form, groupKey: e.target.value })}
            placeholder="masalan: coins"
          />
        </div>
        <div className="flex flex-wrap items-end gap-4 pb-1">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
              className="h-4 w-4"
            />
            Majburiy
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.searchable}
              onChange={(e) => setForm({ ...form, searchable: e.target.checked })}
              className="h-4 w-4"
            />
            Filtrlanadigan
          </label>
          {openForm !== 'new' && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4"
              />
              Aktiv
            </label>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="attr-constraints">Constraints (JSON, ixtiyoriy)</Label>
        <Textarea
          id="attr-constraints"
          value={form.constraints}
          onChange={(e) => setForm({ ...form, constraints: e.target.value })}
          placeholder='{"min": 1, "max": 9}'
          rows={3}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={submit}>
          {openForm === 'new' ? 'Yaratish' : 'Saqlash'}
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={close}>
          <X className="mr-1.5 h-4 w-4" />
          Bekor qilish
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          Jami: {definitions.length} ta atribut
        </p>
        <Button size="sm" onClick={() => open('new')}>
          <Plus className="mr-1.5 h-4 w-4" />
          Yangi atribut
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      {openForm === 'new' && editor}

      {definitions.length === 0 && openForm !== 'new' ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <SlidersHorizontal className="h-8 w-8" />
          <p className="text-sm font-semibold">Atributlar yo&apos;q</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {definitions.map((def) => (
            <li key={def.id} className="space-y-3">
              <div
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card',
                  !def.active && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black">{def.labelUz}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
                      {def.key}
                    </code>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-primary">
                      {def.type}
                    </span>
                    {def.required && (
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-amber-800">
                        Majburiy
                      </span>
                    )}
                    {def.searchable && (
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-emerald-800">
                        Filtr
                      </span>
                    )}
                    {!def.active && (
                      <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-destructive">
                        Noaktiv
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    pozitsiya: {def.position}
                    {def.groupKey ? ` · guruh: ${def.groupKey}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => (openForm === def.id ? close() : open(def))}
                  >
                    <Pencil className="mr-1.5 h-4 w-4" />
                    Tahrirlash
                  </Button>
                  {def.active && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => remove(def)}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      O&apos;chirish
                    </Button>
                  )}
                </div>
              </div>
              {openForm === def.id && editor}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

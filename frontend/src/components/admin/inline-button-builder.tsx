'use client';

import { useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MAX_BUTTONS_PER_ROW,
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  removeButton,
  updateButton,
  validateButton,
  type ButtonSlot,
  type InlineButton,
  type InlineButtonRows,
} from '@/lib/bot-broadcast';

interface InlineButtonBuilderProps {
  rows: InlineButtonRows;
  onChange: (rows: InlineButtonRows) => void;
}

type Draft =
  | { mode: 'new-column'; row: number }
  | { mode: 'new-row' }
  | { mode: 'edit'; slot: ButtonSlot };

/**
 * Telegram inline tugmalarini qatorlar va ustunlar bo'yicha yig'ish paneli.
 *
 * <p>Panel Telegramdagi joylashuvni bir xil takrorlaydi: har qatorning
 * o'ngida "ustun qo'shish", eng pastda "qator qo'shish". Shu tufayli
 * admin nima quryotganini alohida tasavvur qilishi shart emas — panel
 * natijaning o'ziga o'xshaydi.
 */
export function InlineButtonBuilder({ rows, onChange }: InlineButtonBuilderProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  function open(next: Draft) {
    setError(null);
    if (next.mode === 'edit') {
      const existing = rows[next.slot.row][next.slot.col];
      setText(existing.text);
      setUrl(existing.url);
    } else {
      setText('');
      setUrl('https://');
    }
    setDraft(next);
  }

  function close() {
    setDraft(null);
    setError(null);
  }

  function commit() {
    if (!draft) return;
    const button: InlineButton = { text: text.trim(), url: url.trim() };
    const problem = validateButton(button);
    if (problem) {
      setError(problem);
      return;
    }

    if (draft.mode === 'new-column') onChange(addColumn(rows, draft.row, button));
    else if (draft.mode === 'new-row') onChange(addRow(rows, button));
    else onChange(updateButton(rows, draft.slot, button));

    close();
  }

  function discard() {
    if (draft?.mode !== 'edit') return;
    onChange(removeButton(rows, draft.slot));
    close();
  }

  const editing = draft?.mode === 'edit';

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Inline tugmalar</h3>
        <span className="text-xs text-muted-foreground">
          Qatorda {MAX_BUTTONS_PER_ROW} tagacha
        </span>
      </div>

      <div className="space-y-1.5">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-1.5">
            {row.map((button, colIndex) => (
              <button
                key={colIndex}
                type="button"
                onClick={() => open({ mode: 'edit', slot: { row: rowIndex, col: colIndex } })}
                title={button.url}
                className="min-w-0 flex-1 truncate rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/20"
              >
                {button.text}
              </button>
            ))}

            {canAddColumn(rows, rowIndex) && (
              <button
                type="button"
                onClick={() => open({ mode: 'new-column', row: rowIndex })}
                title="Shu qatorga tugma qo'shish"
                aria-label="Shu qatorga tugma qo'shish"
                className="flex w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {canAddRow(rows) && (
          <button
            type="button"
            onClick={() => open({ mode: 'new-row' })}
            title="Yangi qator qo'shish"
            aria-label="Yangi qator qo'shish"
            className="flex w-full items-center justify-center rounded-lg border border-dashed border-border py-2 text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {draft && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tg-btn-text" className="text-xs">
                Tugma matni
              </Label>
              <Input
                id="tg-btn-text"
                value={text}
                autoFocus
                maxLength={32}
                placeholder="Bozorni ochish"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tg-btn-url" className="text-xs">
                Havola
              </Label>
              <Input
                id="tg-btn-url"
                value={url}
                placeholder="https://efbazaar.uz/marketplace"
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
              />
            </div>
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={commit} className="gap-2">
              <Check className="h-4 w-4" />
              {editing ? 'Saqlash' : "Qo'shish"}
            </Button>
            <Button variant="outline" size="sm" onClick={close} className="gap-2">
              <X className="h-4 w-4" />
              Bekor
            </Button>
            {editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={discard}
                className="gap-2 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                O&apos;chirish
              </Button>
            )}
          </div>
        </div>
      )}

      {rows.length === 0 && !draft && (
        <p className="text-xs text-muted-foreground">
          Tugmalar ixtiyoriy — qo&apos;shilmasa xabar faqat matn (va banner) bilan ketadi.
        </p>
      )}
    </div>
  );
}

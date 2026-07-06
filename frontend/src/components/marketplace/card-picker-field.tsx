'use client';

import { useState } from 'react';

import { CardPicker, type PlayerCard } from '@/components/marketplace/card-picker';

interface CardPickerFieldProps {
  /** Card efhub_id from URL (persisted between renders). */
  defaultEfhubId?: number;
  /** Card name from URL — used as the pill label until we re-hydrate the full card. */
  defaultName?: string;
  placeholder?: string;
  id?: string;
}

/**
 * Client-side wrapper that lets a native <form> submit a card selection via
 * hidden inputs. Emits BOTH the efhub_id and the name so the marketplace
 * browse endpoint can:
 *   1. filter listings that contain a card with either matching id or name
 *      (same player, different card is still relevant to the caller);
 *   2. sort the exact-card matches ahead of same-name matches.
 * Falls back to a minimal {@link PlayerCard} placeholder when the URL only
 * carries the id/name pair — enough to render the pill without a fresh
 * lookup, and the real card metadata reappears the next time the user
 * opens the picker.
 */
export function CardPickerField({
  defaultEfhubId,
  defaultName,
  placeholder,
  id,
}: CardPickerFieldProps) {
  const [value, setValue] = useState<PlayerCard[]>(() => {
    if (defaultEfhubId && defaultName) {
      return [{ efhubId: defaultEfhubId, name: defaultName }];
    }
    return [];
  });

  const active = value[0];

  return (
    <>
      <CardPicker
        id={id}
        mode="single"
        value={value}
        onChange={setValue}
        placeholder={placeholder}
      />
      {active && (
        <>
          <input type="hidden" name="attr.valuable_players_id" value={active.efhubId} />
          <input type="hidden" name="attr.valuable_players_name" value={active.name} />
        </>
      )}
    </>
  );
}

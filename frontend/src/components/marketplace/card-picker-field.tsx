'use client';

import { CardPicker, type PlayerCard } from '@/components/marketplace/card-picker';

interface CardPickerFieldProps {
  value: PlayerCard | null;
  onChange(value: PlayerCard | null): void;
  placeholder?: string;
  id?: string;
}

/**
 * Controlled single-card adapter. The surrounding filter draft owns both the
 * selected identity and any rich catalogue metadata, so Clear and route
 * changes cannot leave stale picker state behind.
 */
export function CardPickerField({
  value,
  onChange,
  placeholder,
  id,
}: CardPickerFieldProps) {
  return (
    <CardPicker
      id={id}
      mode="single"
      value={value ? [value] : []}
      onChange={(cards) => onChange(cards[0] ?? null)}
      placeholder={placeholder}
      selectedVariant="tile"
    />
  );
}

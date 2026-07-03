'use client';

import { useState } from 'react';

import { CardPicker } from '@/components/marketplace/card-picker';

interface CardPickerFieldProps {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  id?: string;
}

/**
 * Client-side wrapper that lets a native <form> submit a card selection via a
 * hidden input. Used by the marketplace filter (server-rendered form) to expose
 * the interactive CardPicker without lifting form state into React.
 */
export function CardPickerField({ name, defaultValue, placeholder, id }: CardPickerFieldProps) {
  const [value, setValue] = useState<string[]>(defaultValue ? [defaultValue] : []);

  return (
    <CardPicker
      id={id}
      mode="single"
      value={value}
      onChange={setValue}
      hiddenFieldName={name}
      placeholder={placeholder}
    />
  );
}

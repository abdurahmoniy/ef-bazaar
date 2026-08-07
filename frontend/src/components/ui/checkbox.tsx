'use client';

import * as React from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    return (
      <label
        htmlFor={inputId}
        className={cn(
          'group flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm transition hover:border-primary/40 hover:bg-accent/40',
          props.disabled && 'cursor-not-allowed opacity-60 hover:bg-card',
          className,
        )}
      >
        <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-input bg-card transition group-has-[:checked]:border-primary group-has-[:checked]:bg-primary">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            className="peer absolute inset-0 h-full w-full cursor-inherit appearance-none opacity-0"
            {...props}
          />
          <Check className="pointer-events-none h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" />
        </span>
        {(label || description) && (
          <span className="flex flex-1 flex-col gap-0.5 leading-5">
            {label && <span className="font-semibold text-foreground">{label}</span>}
            {description && <span className="text-xs text-muted-foreground">{description}</span>}
          </span>
        )}
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';

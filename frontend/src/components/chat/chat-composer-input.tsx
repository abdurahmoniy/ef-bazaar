'use client';

import { useLayoutEffect, useRef } from 'react';
import { Textarea, type TextareaProps } from '@/components/ui/textarea';

interface ChatComposerInputProps extends Omit<TextareaProps, 'value' | 'onKeyDown'> {
  value: string;
  onSend: () => void;
}

export function ChatComposerInput({ value, onSend, ...props }: ChatComposerInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const resize = () => {
      input.style.height = '0px';
      const height = input.scrollHeight + 2;
      input.style.height = `${Math.min(128, Math.max(44, height))}px`;
      input.style.overflowY = height > 128 ? 'auto' : 'hidden';
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [value]);

  return (
    <Textarea
      {...props}
      ref={inputRef}
      value={value}
      rows={1}
      aria-label="Xabar"
      className="min-h-11 max-h-32 min-w-0 resize-none rounded-[22px] border-0 bg-transparent px-3 py-2.5 text-base leading-[22px] shadow-none focus-visible:ring-1 focus-visible:ring-inset sm:text-[15px]"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
        // The phone keyboard's Return key adds a line; the adjacent Send button sends.
        const mobile = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
        if (mobile && !event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        if (!props.readOnly && !props.disabled) onSend();
      }}
    />
  );
}

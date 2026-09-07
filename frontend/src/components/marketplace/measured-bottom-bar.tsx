'use client';

import * as React from 'react';
import { useVirtualKeyboard } from '@/hooks/use-virtual-keyboard';
import { cn } from '@/lib/utils';

interface MeasuredBottomBarProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'nav';
  /** When true, automatically slides down offscreen on mobile while the software keyboard is open */
  hideOnKeyboard?: boolean;
}

export function MeasuredBottomBar({
  as: Component = 'div',
  children,
  className,
  hideOnKeyboard = false,
  ...props
}: MeasuredBottomBarProps) {
  const barRef = React.useRef<HTMLElement | null>(null);
  const isKeyboardOpen = useVirtualKeyboard();

  React.useLayoutEffect(() => {
    const bar = barRef.current;
    const shell = bar?.closest<HTMLElement>('[data-marketplace-shell]');
    if (!bar || !shell) return;

    const writeHeight = (height = bar.getBoundingClientRect().height) => {
      if (Number.isFinite(height) && height >= 0) {
        shell.style.setProperty('--marketplace-bottom-bar-height', `${height}px`);
      }
    };
    writeHeight();

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
        const entry = entries[0];
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize;
        writeHeight(borderBox?.blockSize);
      });
    observer?.observe(bar);

    return () => {
      observer?.disconnect();
      shell.style.removeProperty('--marketplace-bottom-bar-height');
    };
  }, []);

  const shouldHide = hideOnKeyboard && isKeyboardOpen;

  return React.createElement(Component, {
    ...props,
    className: cn(
      className,
      hideOnKeyboard && 'transition-all duration-200 ease-out',
      shouldHide && 'max-sm:translate-y-full max-sm:opacity-0 max-sm:pointer-events-none',
    ),
    'data-keyboard-hidden': shouldHide ? 'true' : undefined,
    ref: (node: HTMLElement | null) => { barRef.current = node; },
  }, children);
}

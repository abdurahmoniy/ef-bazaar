'use client';

import * as React from 'react';

interface MeasuredBottomBarProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'nav';
}

export function MeasuredBottomBar({
  as: Component = 'div',
  children,
  ...props
}: MeasuredBottomBarProps) {
  const barRef = React.useRef<HTMLElement | null>(null);

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

  return React.createElement(Component, {
    ...props,
    ref: (node: HTMLElement | null) => { barRef.current = node; },
  }, children);
}

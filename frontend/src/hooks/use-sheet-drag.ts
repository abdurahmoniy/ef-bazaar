'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from 'react';

/** Drag only the sheet header so its scrollable body retains native touch scrolling. */
export function useSheetDrag({ enabled, disabled, onDismiss }: {
  enabled: boolean;
  disabled: boolean;
  onDismiss: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; time: number; height: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [height, setHeight] = useState<number>();
  const [dragging, setDragging] = useState(false);

  const reset = useCallback(() => {
    gesture.current = null;
    setOffset(0);
    setHeight(undefined);
    setDragging(false);
  }, []);

  useEffect(() => { if (!enabled || disabled) reset(); }, [enabled, disabled, reset]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || disabled || !event.isPrimary || event.button !== 0
      || (event.target as Element).closest('button, a, input, select, textarea, [contenteditable="true"]')) return;
    const sheet = contentRef.current;
    if (!sheet) return;
    // A gesture may start before the opening animation has finished.
    sheet.getAnimations?.().forEach((animation) => {
      if ('animationName' in animation && animation.animationName === 'enter') animation.finish();
    });
    const sheetHeight = sheet.getBoundingClientRect().height;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, height: sheetHeight };
    setHeight(sheetHeight);
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId || disabled) return;
    const down = Math.max(0, event.clientY - start.y);
    setOffset(down > Math.abs(event.clientX - start.x) ? down : 0);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    const down = Math.max(0, event.clientY - start.y);
    const distance = Math.min(120, Math.max(64, start.height * 0.2));
    const fast = down >= 48 && down / Math.max(1, event.timeStamp - start.time) >= 0.6;
    if (enabled && !disabled && down > Math.abs(event.clientX - start.x) && (down >= distance || fast)) {
      // Keep the current height and offset until the exit animation ends.
      setOffset(down);
      onDismiss();
    } else {
      setOffset(0);
      setHeight(undefined);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancel(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.id === event.pointerId) reset();
  }

  const style: CSSProperties = {
    height,
    transform: offset > 0 ? `translate3d(0, ${offset}px, 0)` : undefined,
    transition: dragging ? 'none' : undefined,
  };
  return {
    contentRef, style, reset,
    handleProps: enabled ? {
      onPointerDown, onPointerMove, onPointerUp,
      onPointerCancel: cancel, onLostPointerCapture: cancel,
      onDragStart: (event: DragEvent) => event.preventDefault(),
    } : {},
  };
}

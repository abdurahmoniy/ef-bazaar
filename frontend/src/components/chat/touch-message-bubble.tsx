'use client';

import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { Reply } from 'lucide-react';

type Props = HTMLAttributes<HTMLDivElement> & {
  selectionMode?: boolean;
  onReply: () => void;
  onActions: () => void;
};

/** Touch gestures share the existing keyboard/mouse actions without consuming vertical scroll. */
export function TouchMessageBubble({ onReply, onActions, selectionMode = false, children, ...props }: Props) {
  const [offset, setOffset] = useState(0);
  const gesture = useRef<{ x: number; y: number; dx: number; held: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickUntil = useRef(0);
  const touchUntil = useRef(0);
  const actions = useRef(onActions);
  actions.current = onActions;

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function cancel() {
    clearTimer();
    gesture.current = null;
    setOffset(0);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function nativeControl(target: EventTarget | null) {
    return target instanceof Element && !!target.closest('a, video, audio, input, textarea, button:not([aria-label="Rasmni kattalashtirish"])');
  }

  return (
    <div {...props}
      style={{ ...props.style, touchAction: 'pan-y pinch-zoom', transform: offset ? `translateX(${offset}px)` : undefined }}
      onTouchStart={(event) => {
        cancel();
        touchUntil.current = Date.now() + 1000;
        if (event.touches.length !== 1 || (!selectionMode && nativeControl(event.target))) return;
        const touch = event.touches[0];
        gesture.current = { x: touch.clientX, y: touch.clientY, dx: 0, held: false };
        timer.current = setTimeout(() => {
          if (!gesture.current) return;
          gesture.current.held = true;
          suppressClickUntil.current = Date.now() + 1000;
          actions.current();
        }, 500);
      }}
      onTouchMove={(event) => {
        const start = gesture.current;
        if (!start) return;
        if (event.touches.length !== 1) { suppressClickUntil.current = Date.now() + 1000; cancel(); return; }
        const dx = event.touches[0].clientX - start.x;
        const dy = event.touches[0].clientY - start.y;
        if (Math.hypot(dx, dy) > 10) clearTimer();
        if (start.held) return;
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { cancel(); return; }
        if (Math.abs(dx) > 10) suppressClickUntil.current = Date.now() + 1000;
        start.dx = dx > 10 && dx > Math.abs(dy) * 1.5 ? dx : 0;
        setOffset(Math.min(72, start.dx));
      }}
      onTouchEnd={() => {
        const start = gesture.current;
        touchUntil.current = Date.now() + 1000;
        if (start?.held || (start?.dx ?? 0) > 10) suppressClickUntil.current = Date.now() + 1000;
        if (start && !start.held && start.dx >= 56) onReply();
        else if (selectionMode && start && !start.held && start.dx === 0) {
          suppressClickUntil.current = Date.now() + 1000;
          onActions();
        }
        cancel();
      }}
      onTouchCancel={() => { suppressClickUntil.current = Date.now() + 1000; cancel(); }}
      onClickCapture={(event) => {
        if (selectionMode && Date.now() >= suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); onActions(); return; }
        if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); }
      }}
      onClick={(event) => {
        if (Date.now() < touchUntil.current || nativeControl(event.target)) return;
        onActions();
      }}
      onContextMenu={(event) => {
        if (nativeControl(event.target)) return;
        event.preventDefault();
        if (!gesture.current?.held) onActions();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onActions();
      }}
    >
      {offset > 0 && <span aria-hidden="true" className="pointer-events-none absolute -left-9 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-muted text-muted-foreground" style={{ opacity: offset / 56 }}><Reply className="h-4 w-4" /></span>}
      {children}
    </div>
  );
}

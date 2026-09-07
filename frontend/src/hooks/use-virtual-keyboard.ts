'use client';

import { useEffect, useState } from 'react';

/**
 * Detects whether the virtual software keyboard is open on a mobile device.
 * Combines window.visualViewport resize tracking with form focus tracking
 * for immediate response on touch devices.
 */
export function useVirtualKeyboard(): boolean {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isTouchDevice = () => {
      if (window.innerWidth >= 768) return false;
      if (typeof window.matchMedia === 'function') {
        try {
          if (window.matchMedia('(pointer: coarse)').matches) return true;
        } catch {}
      }
      return (
        'ontouchstart' in window ||
        (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0) ||
        true // fallback for mobile widths (< 768)
      );
    };

    const isInput = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag === 'INPUT') {
        const type = (el as HTMLInputElement).type;
        return (
          type !== 'checkbox' &&
          type !== 'radio' &&
          type !== 'file' &&
          type !== 'button' &&
          type !== 'submit' &&
          type !== 'reset'
        );
      }
      return false;
    };

    const checkViewportHeight = () => {
      if (!window.visualViewport) return false;
      // When the virtual keyboard appears, visualViewport.height shrinks significantly (>= 120px)
      const diff = window.innerHeight - window.visualViewport.height;
      return diff > 120;
    };

    let timer: ReturnType<typeof setTimeout> | null = null;

    const updateState = () => {
      if (!isTouchDevice()) {
        setIsKeyboardOpen(false);
        return;
      }
      const active = document.activeElement;
      const focusedOnInput = isInput(active);
      const viewportReduced = checkViewportHeight();

      setIsKeyboardOpen(focusedOnInput || viewportReduced);
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (!isTouchDevice()) return;
      if (isInput(e.target as Element)) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      if (!isTouchDevice()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const active = document.activeElement;
        if (!isInput(active)) {
          setIsKeyboardOpen(checkViewportHeight());
        }
      }, 120);
    };

    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateState);
    vv?.addEventListener('scroll', updateState);
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      if (timer) clearTimeout(timer);
      vv?.removeEventListener('resize', updateState);
      vv?.removeEventListener('scroll', updateState);
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return isKeyboardOpen;
}

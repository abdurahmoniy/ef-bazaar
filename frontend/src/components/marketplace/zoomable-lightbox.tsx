'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface ZoomableLightboxProps {
  swipeDownToClose?: boolean;
  src: string;
  alt: string;
  title?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
  children?: ReactNode;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ZoomableLightbox({
  src,
  alt,
  swipeDownToClose = false,
  title,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  currentIndex,
  totalCount,
}: ZoomableLightboxProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isTransitioning, setIsTransitioning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Gesture tracking refs
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const isPinchingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const touchClickUntil = useRef(0);

  // Reset zoom whenever src changes
  const resetZoom = useCallback(() => {
    setIsTransitioning(true);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    resetZoom();
  }, [src, resetZoom]);

  const handleZoomIn = useCallback(() => {
    setIsTransitioning(true);
    setScale((prev) => {
      const next = clamp(Number((prev + 0.5).toFixed(1)), MIN_SCALE, MAX_SCALE);
      if (next === prev) return prev;
      return next;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setIsTransitioning(true);
    setScale((prev) => {
      const next = clamp(Number((prev - 0.5).toFixed(1)), MIN_SCALE, MAX_SCALE);
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      return next;
    });
  }, []);

  // Escape key & keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && scale === 1 && hasNext && onNext) {
        onNext();
      } else if (e.key === 'ArrowLeft' && scale === 1 && hasPrev && onPrev) {
        onPrev();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        resetZoom();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, onNext, onPrev, hasNext, hasPrev, scale, resetZoom, handleZoomIn, handleZoomOut]);

  // Compute maximum allowable translation to keep image on screen
  const getMaxTranslation = useCallback((targetScale: number) => {
    if (targetScale <= 1) return { maxX: 0, maxY: 0 };
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) {
      const fallbackW = typeof window !== 'undefined' ? window.innerWidth : 800;
      const fallbackH = typeof window !== 'undefined' ? window.innerHeight : 600;
      return {
        maxX: Math.max(0, (fallbackW * (targetScale - 1)) / 2),
        maxY: Math.max(0, (fallbackH * (targetScale - 1)) / 2),
      };
    }
    const rect = img.getBoundingClientRect();
    const renderedW = rect.width / (scale || 1);
    const renderedH = rect.height / (scale || 1);
    const maxX = Math.max(0, (renderedW * targetScale - container.clientWidth) / 2 + 20);
    const maxY = Math.max(0, (renderedH * targetScale - container.clientHeight) / 2 + 20);
    return { maxX, maxY };
  }, [scale]);

  const zoomToPoint = useCallback(
    (targetScale: number, clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) {
        setScale(targetScale);
        setPosition({ x: 0, y: 0 });
        return;
      }
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = centerX - clientX;
      const deltaY = centerY - clientY;

      const factor = (targetScale - 1) / (targetScale || 1);
      const newX = deltaX * factor;
      const newY = deltaY * factor;

      const { maxX, maxY } = getMaxTranslation(targetScale);
      setIsTransitioning(true);
      setScale(targetScale);
      setPosition({
        x: clamp(newX, -maxX, maxX),
        y: clamp(newY, -maxY, maxY),
      });
    },
    [getMaxTranslation],
  );

  // Wheel zoom (mouse / trackpad)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.005;
    const targetScale = clamp(Number((scale + delta).toFixed(2)), MIN_SCALE, MAX_SCALE);

    if (targetScale === 1) {
      setIsTransitioning(true);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setIsTransitioning(false);
      setScale(targetScale);
      const { maxX, maxY } = getMaxTranslation(targetScale);
      setPosition((pos) => ({
        x: clamp(pos.x, -maxX, maxX),
        y: clamp(pos.y, -maxY, maxY),
      }));
    }
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    hasDraggedRef.current = false;
    touchClickUntil.current = Date.now() + 1000;

    if (e.touches.length === 2) {
      // Pinch start
      isPinchingRef.current = true;
      setIsTransitioning(false);
      const [t1, t2] = [e.touches[0], e.touches[1]];
      pinchStartDistRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchStartScaleRef.current = scale;
      dragStartRef.current = null;
    } else if (e.touches.length === 1) {
      // Single finger: record for potential drag or swipe
      const touch = e.touches[0];
      dragStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        posX: position.x,
        posY: position.y,
      };
      swipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
      setIsTransitioning(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinchingRef.current && pinchStartDistRef.current) {
      // Pinch zoom in progress
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const factor = currentDist / pinchStartDistRef.current;
      const targetScale = clamp(pinchStartScaleRef.current * factor, 0.8, MAX_SCALE + 0.5);

      setScale(targetScale);

      const { maxX, maxY } = getMaxTranslation(targetScale);
      setPosition((pos) => ({
        x: clamp(pos.x, -maxX, maxX),
        y: clamp(pos.y, -maxY, maxY),
      }));
      hasDraggedRef.current = true;
    } else if (e.touches.length === 1 && dragStartRef.current && scale > 1.05) {
      // Panning while zoomed in
      e.preventDefault();
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStartRef.current.x;
      const deltaY = touch.clientY - dragStartRef.current.y;

      if (Math.hypot(deltaX, deltaY) > 5) {
        hasDraggedRef.current = true;
      }

      const { maxX, maxY } = getMaxTranslation(scale);
      setPosition({
        x: clamp(dragStartRef.current.posX + deltaX, -maxX, maxX),
        y: clamp(dragStartRef.current.posY + deltaY, -maxY, maxY),
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchClickUntil.current = Date.now() + 1000;
    if (isPinchingRef.current) {
      if (e.touches.length < 2) {
        isPinchingRef.current = false;
        pinchStartDistRef.current = null;
        dragStartRef.current = null;
        swipeStartRef.current = null;
        lastTapRef.current = null;
        // Snap back to 1x if pinch scale ended < 1
        if (scale < 1.05) {
          resetZoom();
        } else if (scale > MAX_SCALE) {
          setIsTransitioning(true);
          setScale(MAX_SCALE);
          const { maxX, maxY } = getMaxTranslation(MAX_SCALE);
          setPosition((pos) => ({
            x: clamp(pos.x, -maxX, maxX),
            y: clamp(pos.y, -maxY, maxY),
          }));
        }
      }
      return;
    }

    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      const now = Date.now();
      const lastTap = lastTapRef.current;

      const swipe = swipeStartRef.current;
      const dx = swipe ? touch.clientX - swipe.x : 0;
      const dy = swipe ? touch.clientY - swipe.y : 0;
      if (Math.hypot(dx, dy) > 10) {
        lastTapRef.current = null;
        hasDraggedRef.current = true;
        if (scale <= 1.05 && swipe) {
          if (swipeDownToClose && dy > 80 && dy > Math.abs(dx) * 1.5) onClose();
          else if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0 && hasNext) onNext?.();
            else if (dx > 0 && hasPrev) onPrev?.();
          }
        }
        dragStartRef.current = null;
        swipeStartRef.current = null;
        return;
      }

      // Check for double tap
      if (
        lastTap &&
        now - lastTap.time < 300 &&
        Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 30
      ) {
        lastTapRef.current = null;
        if (scale > 1.05) {
          resetZoom();
        } else {
          zoomToPoint(DOUBLE_TAP_SCALE, touch.clientX, touch.clientY);
        }
        return;
      }

      lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };

      dragStartRef.current = null;
      swipeStartRef.current = null;
    }
  };

  // Mouse drag when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1.05) return;
    e.preventDefault();
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    setIsTransitioning(false);
    hasDraggedRef.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStartRef.current || scale <= 1.05) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    if (Math.hypot(deltaX, deltaY) > 5) {
      hasDraggedRef.current = true;
    }

    const { maxX, maxY } = getMaxTranslation(scale);
    setPosition({
      x: clamp(dragStartRef.current.posX + deltaX, -maxX, maxX),
      y: clamp(dragStartRef.current.posY + deltaY, -maxY, maxY),
    });
  };

  const handleMouseUp = () => {
    dragStartRef.current = null;
  };

  return (
    <div
      data-testid="zoomable-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title || alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 select-none touch-none"
      onClick={(e) => {
        // Close on backdrop click only if not zoomed and not dragged
        if (e.target === e.currentTarget && !hasDraggedRef.current && scale <= 1.05) {
          onClose();
        }
      }}
    >
      {/* Top bar: title, counter, close button */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          {totalCount !== undefined && totalCount > 1 && currentIndex !== undefined && (
            <div className="rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white/90 backdrop-blur-md">
              {currentIndex + 1} / {totalCount}
            </div>
          )}
          {scale > 1.05 && (
            <div className="rounded-full bg-primary/80 px-2.5 py-0.5 text-xs font-extrabold text-white backdrop-blur-md">
              {Math.round(scale * 100)}%
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Image Viewport */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          dragStartRef.current = null;
          swipeStartRef.current = null;
          pinchStartDistRef.current = null;
          isPinchingRef.current = false;
          lastTapRef.current = null;
          hasDraggedRef.current = true;
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="relative flex h-full w-full items-center justify-center overflow-hidden p-2 sm:p-6"
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isTransitioning
              ? 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)'
              : 'none',
          }}
          className={cn(
            'max-h-[85vh] max-w-full rounded-lg object-contain select-none',
            scale > 1.05 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (hasDraggedRef.current || Date.now() < touchClickUntil.current) return;
            // On desktop click: toggle double-tap zoom
            if (scale > 1.05) {
              resetZoom();
            } else {
              zoomToPoint(DOUBLE_TAP_SCALE, e.clientX, e.clientY);
            }
          }}
        />
      </div>

      {/* Previous / Next Arrow Controls (visible when not zoomed and multiple images exist) */}
      {scale <= 1.05 && hasPrev && onPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="Oldingi rasm"
          className="absolute left-3 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95 sm:left-6"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {scale <= 1.05 && hasNext && onNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="Keyingi rasm"
          className="absolute right-3 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95 sm:right-6"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Floating Bottom Zoom Toolbar */}
      <div className="absolute bottom-5 z-20 flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={scale <= MIN_SCALE}
          aria-label="Kichiklashtirish"
          className="grid h-9 w-9 place-items-center rounded-full text-white/90 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={resetZoom}
          aria-label="100% o'lchamga qaytarish"
          className="flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-bold text-white/90 transition hover:bg-white/20 active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{Math.round(scale * 100)}%</span>
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={scale >= MAX_SCALE}
          aria-label="Kattalashtirish"
          className="grid h-9 w-9 place-items-center rounded-full text-white/90 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

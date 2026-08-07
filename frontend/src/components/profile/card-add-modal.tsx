'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { AlertTriangle, ChevronDown, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  detectBrand,
  formatPanForDisplay,
  luhnCheck,
  normalizePan,
  type DetectableBrand,
} from '@/lib/card-detect';
import { cn } from '@/lib/utils';

interface CardAddModalProps {
  onClose: () => void;
  onAdded: () => void;
}

/**
 * "Karta qo'shish" modal. Client-only — POSTs to `/api/trade/v1/cards` and
 * calls `router.refresh()` so the SSR profile-cards fetch re-runs. Scope
 * is deliberately minimal (no gateway, no SMS OTP): Luhn + BIN detection
 * mirror the backend contract so the user gets immediate feedback for
 * bad PANs before the round trip.
 */
export function CardAddModal({ onClose, onAdded }: CardAddModalProps) {
  const router = useRouter();
  const [panRaw, setPanRaw] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [showHint, setShowHint] = useState(false);

  const [panError, setPanError] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [submitting, startSubmit] = useTransition();

  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Autofocus the PAN input when the modal mounts.
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    // Close on Escape — matches the existing modal ergonomics in
    // `chat/trade-panel.tsx` (which closes on backdrop click).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const panDigits = useMemo(() => normalizePan(panRaw), [panRaw]);
  const detectedBrand = useMemo(() => detectBrand(panDigits), [panDigits]);

  const handlePanChange = useCallback((raw: string) => {
    // Keep the visible value pretty (`4111 1111 …`), but the state is the raw
    // formatted string so the caret stays in a reasonable place; we normalize
    // when reading digits.
    const formatted = formatPanForDisplay(raw);
    setPanRaw(formatted);
    setPanError(null);
    setServerError(null);
  }, []);

  const handleExpiryChange = useCallback((raw: string) => {
    // Auto-format as `MM/YY`. Strip everything but digits, then insert the
    // slash after the first two digits.
    const digits = raw.replace(/\D+/g, '').slice(0, 4);
    let value = digits;
    if (digits.length >= 3) {
      value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else if (digits.length === 2 && raw.endsWith('/')) {
      value = `${digits}/`;
    }
    setExpiry(value);
    setExpiryError(null);
    setServerError(null);
  }, []);

  const validate = useCallback((): {
    ok: true;
    brand: DetectableBrand;
    expiryMonth: number;
    expiryYear: number;
  } | { ok: false } => {
    let hasError = false;

    if (!luhnCheck(panDigits)) {
      setPanError("Karta raqami noto'g'ri (Luhn tekshiruvi o'tmadi)");
      hasError = true;
    }

    if (detectedBrand === null) {
      setPanError(
        "Karta turi tanib olinmadi (VISA / MC / UZCARD / HUMO qo'llab-quvvatlanadi)",
      );
      hasError = true;
    }

    // MM/YY parsing + not-in-past check.
    const match = expiry.match(/^(\d{2})\/(\d{2})$/);
    let expiryMonth = 0;
    let expiryYear = 0;
    if (!match) {
      setExpiryError("Format: MM/YY (masalan 12/30)");
      hasError = true;
    } else {
      expiryMonth = Number(match[1]);
      expiryYear = 2000 + Number(match[2]);
      if (expiryMonth < 1 || expiryMonth > 12) {
        setExpiryError("Oy 01-12 oralig'ida bo'lishi kerak");
        hasError = true;
      } else {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const notInPast =
          expiryYear > currentYear ||
          (expiryYear === currentYear && expiryMonth >= currentMonth);
        if (!notInPast) {
          setExpiryError("Amal qilish muddati o'tib ketgan");
          hasError = true;
        }
      }
    }

    if (hasError || detectedBrand === null) return { ok: false };
    return {
      ok: true,
      brand: detectedBrand,
      expiryMonth,
      expiryYear,
    };
  }, [detectedBrand, expiry, panDigits]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setPanError(null);
      setExpiryError(null);
      setServerError(null);

      const result = validate();
      if (!result.ok) return;

      const payload = {
        pan: panDigits,
        expiryMonth: result.expiryMonth,
        expiryYear: result.expiryYear,
        brand: result.brand,
        cvv: cvv.trim() ? cvv.trim() : undefined,
        saveToProfile: true,
      };

      startSubmit(async () => {
        const res = await fetch('/api/trade/v1/cards', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          setServerError(await readErrorMessage(res));
          return;
        }
        // Success — refresh SSR data so the tab redraws with the new card.
        router.refresh();
        onAdded();
      });
    },
    [cvv, onAdded, panDigits, router, validate],
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-card-hover">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-foreground">
            Karta qo&apos;shish
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-11 p-0"
            onClick={onClose}
            aria-label="Yopish"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <form className="space-y-3" onSubmit={handleSubmit} noValidate>
          <div>
            <Label htmlFor="card-pan">Karta raqami</Label>
            <div className="relative">
              <Input
                id="card-pan"
                ref={firstFieldRef}
                type="text"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 5678 9012 3456"
                value={panRaw}
                onChange={(e) => handlePanChange(e.target.value)}
                maxLength={19 + 4} // 16 digits + 3 spaces + a little slack for 19-digit PANs
                required
                aria-invalid={panError ? 'true' : undefined}
                className={cn('pr-16 font-mono tracking-wider', panError && 'border-destructive')}
              />
              {detectedBrand && (
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-primary">
                  {detectedBrand}
                </span>
              )}
            </div>
            {panError && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {panError}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="card-expiry">Amal qilish muddati</Label>
              <Input
                id="card-expiry"
                type="text"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={expiry}
                onChange={(e) => handleExpiryChange(e.target.value)}
                maxLength={5}
                required
                aria-invalid={expiryError ? 'true' : undefined}
                className={cn('font-mono', expiryError && 'border-destructive')}
              />
              {expiryError && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {expiryError}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="card-cvv">
                CVV{' '}
                <span className="text-[10px] font-normal text-muted-foreground">
                  (ixtiyoriy)
                </span>
              </Label>
              <Input
                id="card-cvv"
                type="text"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D+/g, '').slice(0, 4))}
                maxLength={4}
                className="font-mono"
              />
            </div>
          </div>

          {serverError && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left font-semibold text-foreground/80"
              aria-expanded={showHint}
            >
              <span>Test uchun raqamlar</span>
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform', showHint && 'rotate-180')}
              />
            </button>
            {showHint && (
              <ul className="mt-2 space-y-0.5 font-mono">
                <li>VISA: 4111 1111 1111 1111</li>
                <li>MC: 5555 5555 5555 4444</li>
                <li>UZCARD: 8600 0000 0000 0007</li>
                <li>HUMO: 9860 0000 0000 0000</li>
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Bekor qilish
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Qo‘shilmoqda…' : "Qo'shish"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string' && payload.message.length > 0) {
      return payload.message;
    }
    if (typeof payload.error === 'string' && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    // ignore JSON parse errors
  }
  if (response.status === 401 || response.status === 403) {
    return 'Kirish talab qilinadi';
  }
  if (response.status === 400) {
    return "So'rov noto'g'ri (karta ma'lumotlari)";
  }
  return "Kartani qo'shib bo'lmadi";
}

'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { deleteAccountAction } from '@/app/auth/actions';

/**
 * Confirmation-guarded destructive action. Two-step: the initial button
 * arms the confirm state; the second click submits. Preventing muscle-
 * memory disasters is more valuable than the extra tap.
 */
export function DeleteAccountButton() {
  const [armed, setArmed] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onDelete = React.useCallback(async () => {
    setPending(true);
    setError(null);
    // deleteAccountAction redirects to '/' on success — this returns only on error.
    const res = await deleteAccountAction();
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'Akkountni o\'chirib bo\'lmadi');
      setArmed(false);
    }
  }, []);

  if (armed) {
    return (
      <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Akkountingiz butunlay o'chiriladi. Barcha e'lonlar, chat va profil ma'lumotlaringiz
            yo'qoladi. Bu amalni bekor qilib bo'lmaydi.
          </p>
        </div>
        {error && (
          <p className="text-xs text-destructive/90">{error}</p>
        )}
        <div className="flex gap-2">
          <Button
            variant="destructive"
            className="flex-1"
            onClick={onDelete}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                O'chirilmoqda…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Ha, o'chirish
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setArmed(false)}
            disabled={pending}
          >
            Bekor qilish
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setArmed(true)}
      >
        <Trash2 className="h-4 w-4" />
        Akkountni o'chirish
      </Button>
      <p className="text-xs text-muted-foreground">
        Barcha ma'lumotlar butunlay o'chiriladi. Keyin yangi akkount ochsa bo'ladi.
      </p>
    </div>
  );
}

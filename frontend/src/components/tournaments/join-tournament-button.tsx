'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, LogIn, LogOut, Send, UserPlus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { joinTournament, leaveTournament } from '@/lib/tournament-actions';

interface JoinTournamentButtonProps {
  tournamentId: number;
  /** Viewer login qilganmi — anonimlarga login CTA ko'rsatiladi. */
  authenticated: boolean;
  /** Viewer allaqachon qatnashchimi. */
  joined: boolean;
  /** Jamoa nomi uchun default — user displayName. */
  defaultTeamName?: string;
}

/**
 * Turnirga qo'shilish. PUBLIC turnirda backend 202 qaytaradi (organizer
 * tasdig'i kutiladi) — bu holat foydalanuvchiga alohida tushuntiriladi.
 */
export function JoinTournamentButton({
  tournamentId,
  authenticated,
  joined,
  defaultTeamName,
}: JoinTournamentButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState(defaultTeamName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!authenticated) {
    return (
      <div className="space-y-2">
        <Button variant="default" className="w-full sm:w-auto" asChild>
          <Link href="/auth/login?from=/tournaments">
            <LogIn className="h-4 w-4" />
            Qatnashish uchun kiring
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Turnirga qo&apos;shilish uchun avval hisobingizga kiring.
        </p>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4" />
          Siz turnirga qo&apos;shilgansiz
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm('Turnirni tark etasizmi?')) return;
            setBusy(true);
            setError(null);
            const result = await leaveTournament(tournamentId);
            setBusy(false);
            if (result.ok) {
              router.refresh();
            } else {
              setError(result.message);
            }
          }}
        >
          <LogOut className="h-4 w-4" />
          Tark etish
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Turnirga qo&apos;shilish
        </Button>
        {notice && (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="rounded-xl border border-border bg-background p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const name = teamName.trim();
        if (!name) {
          setError('Jamoa nomini kiriting');
          return;
        }
        setBusy(true);
        setError(null);
        const result = await joinTournament(tournamentId, name);
        setBusy(false);
        if (result.ok) {
          setOpen(false);
          setNotice(
            result.data.pendingApproval
              ? "So'rov yuborildi — organizer tasdig'i kutilmoqda"
              : 'Muvaffaqiyatli qo\'shildingiz',
          );
          router.refresh();
        } else {
          setError(result.message);
        }
      }}
    >
      <label htmlFor={`team-name-${tournamentId}`} className="text-xs font-bold text-foreground">
        Jamoa nomi
      </label>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Turnirda ko&apos;rinadigan nom. 64 belgigacha.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          id={`team-name-${tournamentId}`}
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="Masalan, Real EFC"
          maxLength={64}
          autoFocus
        />
        <Button type="submit" disabled={busy} size="sm">
          <Send className="h-4 w-4" />
          {busy ? 'Yuborilmoqda…' : 'Yuborish'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          aria-label="Bekor qilish"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-destructive">{error}</p>}
    </form>
  );
}

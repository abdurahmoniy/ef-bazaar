'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
      <Button variant="outline" asChild>
        <Link href="/auth/login?from=/tournaments">Qatnashish uchun kiring</Link>
      </Button>
    );
  }

  if (joined) {
    return (
      <div className="space-y-1.5">
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
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
          Tark etish
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-1.5">
        <Button onClick={() => setOpen(true)}>Qatnashish</Button>
        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      </div>
    );
  }

  return (
    <form
      className="w-full max-w-sm space-y-1.5"
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
              : null,
          );
          router.refresh();
        } else {
          setError(result.message);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="Jamoa nomi"
          maxLength={64}
          autoFocus
        />
        <Button type="submit" disabled={busy}>
          Yuborish
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

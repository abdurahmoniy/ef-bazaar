'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Gift, Loader2, Save, UserPlus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  formatEarned,
  getInvitedBy,
  getReferralSettings,
  getReferrerLeaderboard,
  referrerLabel,
  sortByInvited,
  updateReferralSettings,
  type ReferrerRow,
} from '@/lib/admin-referrals';
import type { InvitedUser } from '@/lib/referrals';

/** Bitta taklif qiluvchi qatori — bosilganda kimlarni olib kelgani ochiladi. */
function ReferrerLine({ row }: { row: ReferrerRow }) {
  const [open, setOpen] = useState(false);
  const [invited, setInvited] = useState<InvitedUser[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Faqat birinchi ochilishda tortamiz: reyting uzun bo'lishi mumkin
    // va har bosishda so'rov yuborish keraksiz.
    if (next && invited === null && !loading) {
      setLoading(true);
      try {
        setInvited(await getInvitedBy(row.userId));
      } catch {
        setInvited([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{referrerLabel(row)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {row.invitedCount} ta · {row.rewardedCount} savdo
        </span>
        <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
          {formatEarned(row.earnedSom)}
        </span>
      </button>

      {open && (
        <div className="bg-muted/30 px-4 pb-3 pl-11">
          {loading ? (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Yuklanmoqda…
            </p>
          ) : invited && invited.length > 0 ? (
            <ul className="space-y-1 py-1">
              {invited.map((person) => (
                <li key={person.userId} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate">
                    {person.displayName ?? person.userId.slice(0, 8)}
                    <span className="ml-2 text-muted-foreground">
                      {new Date(person.joinedAt).toLocaleDateString('uz-UZ')}
                    </span>
                  </span>
                  {person.rewardedAt ? (
                    <span className="flex shrink-0 items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Gift className="h-3 w-3" />
                      +{formatEarned(person.rewardSom ?? 0)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-muted-foreground">Savdo kutilmoqda</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-xs text-muted-foreground">Ma&apos;lumot yo&apos;q.</p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Adminka "Referallar" bo'limi.
 *
 * <p>Hamkorlar bo'limidan alohida, chunki taklif qiluvchilarning
 * aksariyati hamkor emas — bu har bir foydalanuvchining imkoniyati.
 */
export function AdminReferrals() {
  const [rows, setRows] = useState<ReferrerRow[]>([]);
  const [reward, setReward] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getReferrerLeaderboard(), getReferralSettings()])
      .then(([leaderboard, settings]) => {
        setRows(sortByInvited(leaderboard));
        setReward(String(settings.rewardSom));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Yuklanmadi'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    const value = Number(reward);
    if (!Number.isFinite(value) || value < 0) {
      setError("Mukofot manfiy bo'lishi mumkin emas");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await updateReferralSettings(value);
      setReward(String(updated.rewardSom));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saqlanmadi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Referallar</h1>
          <p className="text-sm text-muted-foreground">
            Kim platformaga odam olib kelayapti va qanchasi savdoga aylanayapti.
          </p>
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Mukofot</h2>
        <p className="text-xs text-muted-foreground">
          Taklif qilingan foydalanuvchi <strong>birinchi</strong> savdosini yakunlaganda taklif
          qiluvchining hamyoniga o&apos;tkaziladi. Har bir odam uchun bir marta.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-label="Mukofot summasi (so'm)"
          />
          <span className="text-sm text-muted-foreground">so&apos;m</span>
          <Button onClick={save} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saqlandi' : 'Saqlash'}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <Users className="h-4 w-4" />
          Reyting
        </h2>
        {loading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Hali hech kim taklif qilmagan.</p>
        ) : (
          <ul>
            {rows.map((row) => (
              <ReferrerLine key={row.userId} row={row} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

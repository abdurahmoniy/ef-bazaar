'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Pencil } from 'lucide-react';

import { GamerCardFullscreen } from '@/components/gamer/gamer-card-fullscreen';
import { GamerCardCompact, GamerCardView } from '@/components/gamer/gamer-card-view';
import { ShareGamerCardButton } from '@/components/gamer/share-gamer-card-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchMyGamerCard, updateMyGamerProfile } from '@/lib/gamer-client';
import type { GamerCardResponse, GamerPlatform } from '@/lib/gamer-types';

const CAPTURE_ID = 'my-gamer-card-capture';

const PLATFORMS: Array<{ value: GamerPlatform | ''; label: string }> = [
  { value: '', label: 'Tanlanmagan' },
  { value: 'ANDROID', label: 'Android' },
  { value: 'IOS', label: 'iOS' },
  { value: 'BOTH', label: 'Android + iOS' },
];

interface MyGamerCardSectionProps {
  /** Extra actions rendered alongside Share/Edit/Open (e.g. admin panel link). */
  trailingAction?: ReactNode;
  /** Owner's email — shown under @username in the tier banner. */
  email?: string | null;
}

/** Profildagi "Gamer Card" bo'limi: ko'rish + tahrirlash + ulashish. */
export function MyGamerCardSection({ trailingAction, email }: MyGamerCardSectionProps = {}) {
  const [card, setCard] = useState<GamerCardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [bio, setBio] = useState('');
  const [platform, setPlatform] = useState<GamerPlatform | ''>('');
  const [division, setDivision] = useState('');
  const [team, setTeam] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchMyGamerCard().then((data) => {
      if (cancelled) return;
      setCard(data);
      setLoading(false);
      if (data) {
        setBio(data.bio ?? '');
        setPlatform(data.platform ?? '');
        setDivision(data.highestDivision?.toString() ?? '');
        setTeam(data.favoriteTeam ?? '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const divisionNum = Number.parseInt(division, 10);
      const updated = await updateMyGamerProfile({
        bio: bio.trim() || null,
        platform: platform || null,
        highestDivision:
          Number.isInteger(divisionNum) && divisionNum >= 1 && divisionNum <= 9
            ? divisionNum
            : null,
        favoriteTeam: team.trim() || null,
      });
      if (updated) {
        setCard(updated);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!card) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Gamer Card yuklanmadi — keyinroq urinib ko'ring.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GamerCardCompact card={card} />

      {/* Off-screen full poster — PNG ulashish shu nusxani suratga oladi. */}
      <div className="gc-capture-host" aria-hidden>
        <GamerCardView card={card} captureId={CAPTURE_ID} email={email} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <GamerCardFullscreen card={card} email={email} captureId={CAPTURE_ID} />
        <ShareGamerCardButton captureId={CAPTURE_ID} username={card.telegramUsername} />
        <Button variant="outline" onClick={() => setEditing((v) => !v)} className="gap-2">
          <Pencil className="h-4 w-4" />
          {editing ? 'Bekor qilish' : 'Tahrirlash'}
        </Button>
        <Button asChild variant="ghost" className="gap-2">
          <Link href={`/gamers/${card.userId}`}>
            <ExternalLink className="h-4 w-4" />
            Ochiq sahifa
          </Link>
        </Button>
        {trailingAction && <div className="ml-auto">{trailingAction}</div>}
      </div>

      {editing && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-foreground">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="O'zingiz haqingizda qisqacha…"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-foreground">Platforma</span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as GamerPlatform | '')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-foreground">Eng yuqori divizion</span>
              <Input
                type="number"
                min={1}
                max={9}
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                placeholder="1–9"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-foreground">Sevimli jamoa</span>
              <Input
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                maxLength={64}
                placeholder="Masalan: Barcelona"
              />
            </label>
          </div>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Saqlash
          </Button>
        </div>
      )}
    </div>
  );
}

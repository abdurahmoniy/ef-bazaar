'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Maximize2, Pencil } from 'lucide-react';

import { GamerCardFullscreen } from '@/components/gamer/gamer-card-fullscreen';
import { GamerCardCompact, GamerCardView } from '@/components/gamer/gamer-card-view';
import { ShareGamerCardButton } from '@/components/gamer/share-gamer-card-button';
import { OverflowMenu, overflowItemClass } from '@/components/navigation/overflow-menu';
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
  /**
   * Section nav rendered on the left of the action row. The profile used to
   * stack a five-button action row on top of a five-tab row — two strips of
   * identical weight, ~110px of chrome before any content. They share one row
   * now: nav left, one primary action and an overflow menu right.
   */
  navSlot?: ReactNode;
  /** Owner's email — shown under @username in the tier banner. */
  email?: string | null;
}

/** Profildagi "Gamer Card" bo'limi: ko'rish + tahrirlash + ulashish. */
export function MyGamerCardSection({ navSlot, email }: MyGamerCardSectionProps = {}) {
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

      {/* One row only where there is room for one. Sharing a line, the tab
          strip got whatever width the buttons left over and clipped mid-item
          with no scroll affordance. Measured: five expanded tabs need ~555px
          and the buttons ~180px, so they only both fit from lg up — at sm the
          strip was still scrolling. Below that they stack, actions first so
          the tabs sit directly above the section they switch. */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="order-2 min-w-0 flex-1 lg:order-1">{navSlot}</div>
        <div className="order-1 flex shrink-0 items-center justify-end gap-2 lg:order-2">
          <ShareGamerCardButton
            captureId={CAPTURE_ID}
            username={card.telegramUsername}
            className="h-9 rounded-full px-3.5 text-[13px]"
          />
          <OverflowMenu>
            {(close) => (
              <>
                <GamerCardFullscreen
                  card={card}
                  email={email}
                  captureId={CAPTURE_ID}
                  renderTrigger={(open) => (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close();
                        open();
                      }}
                      className={overflowItemClass}
                    >
                      <Maximize2 className="h-4 w-4 text-muted-foreground" />
                      To&apos;liq ko&apos;rish
                    </button>
                  )}
                />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    setEditing((v) => !v);
                  }}
                  className={overflowItemClass}
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  {editing ? 'Bekor qilish' : 'Tahrirlash'}
                </button>
                <Link
                  href={`/gamers/${card.userId}`}
                  role="menuitem"
                  onClick={close}
                  className={overflowItemClass}
                >
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  Ochiq sahifa
                </Link>
              </>
            )}
          </OverflowMenu>
        </div>
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

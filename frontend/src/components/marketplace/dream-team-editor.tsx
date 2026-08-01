'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus, Save, Search, Sparkles, Trash2, Users, X } from 'lucide-react';

import {
  DEFAULT_FORMATION,
  DreamTeamPitch,
  FORMATIONS,
  emptySlots,
  reshape,
} from '@/components/marketplace/dream-team-pitch';
import { CardPicker, type PlayerCard } from '@/components/marketplace/card-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createDreamTeam,
  deleteDreamTeam,
  updateDreamTeam,
} from '@/lib/marketplace-actions';
import {
  dreamTeamFilterValue,
  type DreamTeam,
  type DreamTeamSlot,
} from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

const MUST_HAVE_WEIGHT = 3;

/**
 * Squad builder: pick a formation, fill 11 slots from the card catalogue, save,
 * then filter the marketplace by how well an account covers it.
 *
 * Slots keep a full card snapshot rather than an id, matching how listings
 * store {@code valuable_players} — the saved squad stays readable even if the
 * catalogue moves under it.
 */
export function DreamTeamEditor({ initialTeams }: { initialTeams: DreamTeam[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const first = initialTeams[0] ?? null;
  const [teamId, setTeamId] = useState<string | null>(first?.id ?? null);
  const [name, setName] = useState(first?.name ?? "Mening jamoam");
  const [formation, setFormation] = useState(first?.formation ?? DEFAULT_FORMATION);
  const [slots, setSlots] = useState<DreamTeamSlot[]>(
    first ? reshape(first.slots, first.formation) : emptySlots(DEFAULT_FORMATION),
  );
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function loadTeam(team: DreamTeam | null) {
    setError(null);
    setNotice(null);
    setEditingSlot(null);
    setTeamId(team?.id ?? null);
    setName(team?.name ?? 'Yangi jamoa');
    setFormation(team?.formation ?? DEFAULT_FORMATION);
    setSlots(
      team ? reshape(team.slots, team.formation) : emptySlots(DEFAULT_FORMATION),
    );
  }

  function changeFormation(next: string) {
    setFormation(next);
    // Keep the cards, re-label the positions — switching shape shouldn't wipe
    // the squad the user just built.
    setSlots((prev) => reshape(prev, next));
  }

  function assign(index: number, card: PlayerCard) {
    setSlots((prev) =>
      prev.map((slot, i) =>
        i === index
          ? {
              ...slot,
              card: {
                efhubId: card.efhubId,
                name: card.name,
                overallRating: card.overallRating,
                maxOverallRating: card.maxOverallRating,
                cardType: card.cardType,
                position: card.position,
                playingStyle: card.playingStyle,
                imageUrl: card.imageUrl,
              },
            }
          : slot,
      ),
    );
    setEditingSlot(null);
  }

  function clearSlot(index: number) {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, card: undefined } : slot)));
  }

  function toggleWeight(index: number) {
    setSlots((prev) =>
      prev.map((slot, i) =>
        i === index ? { ...slot, w: (slot.w ?? 1) > 1 ? 1 : MUST_HAVE_WEIGHT } : slot,
      ),
    );
  }

  function save() {
    setError(null);
    setNotice(null);
    const payload = {
      name: name.trim() || 'Mening jamoam',
      formation,
      // Empty slots carry no information and would only bloat the row.
      slots: slots.filter((slot) => slot.card),
    };
    startTransition(async () => {
      const result = teamId
        ? await updateDreamTeam(teamId, payload)
        : await createDreamTeam(payload);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTeamId(result.data.id);
      setNotice('Jamoa saqlandi');
      router.refresh();
    });
  }

  function remove() {
    if (!teamId) return;
    if (!window.confirm(`"${name}" jamoasi o'chirilsinmi?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDreamTeam(teamId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      loadTeam(null);
      router.refresh();
    });
  }

  const filled = slots.filter((slot) => slot.card).length;
  const filterValue = dreamTeamFilterValue(slots);
  const browseHref = filterValue
    ? `/marketplace?attr.dream_team=${encodeURIComponent(filterValue)}&attr.dream_team_min_match=40`
    : '/marketplace';

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        <DreamTeamPitch
          slots={slots}
          formation={formation}
          onSlotClick={setEditingSlot}
          onClear={clearSlot}
          onToggleWeight={toggleWeight}
        />
        <p className="text-center text-xs font-semibold text-muted-foreground">
          {filled}/11 o&apos;yinchi · yulduzcha bosilsa slot &quot;muhim&quot; bo&apos;ladi
          ({MUST_HAVE_WEIGHT}x vazn)
        </p>
      </div>

      <div className="space-y-4">
        {initialTeams.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {initialTeams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => loadTeam(team)}
                className={cn(
                  'tap-press rounded-lg border px-2.5 py-1.5 text-xs font-bold transition',
                  team.id === teamId
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {team.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => loadTeam(null)}
              className="tap-press inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-bold text-muted-foreground transition hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Yangi
            </button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Jamoa nomi</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-formation">Formatsiya</Label>
            <select
              id="team-formation"
              value={formation}
              onChange={(event) => changeFormation(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.keys(FORMATIONS).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {notice}
          </p>
        )}

        {editingSlot === null ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-bold">Maydondagi slotni bosing</p>
            <p className="text-xs font-semibold text-muted-foreground">
              O&apos;sha pozitsiyaga o&apos;yinchi tanlaysiz.
            </p>
          </div>
        ) : (
          <SlotPicker
            position={slots[editingSlot]?.position ?? ''}
            onPick={(card) => assign(editingSlot, card)}
            onCancel={() => setEditingSlot(null)}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={isPending || filled === 0}>
            <Save className="mr-1.5 h-4 w-4" />
            {teamId ? 'Saqlash' : 'Yaratish'}
          </Button>
          <Button asChild variant="outline" disabled={filled === 0}>
            <a href={browseHref}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Shu jamoa bo&apos;yicha qidirish
            </a>
          </Button>
          {teamId && (
            <Button variant="destructive" onClick={remove} disabled={isPending}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              O&apos;chirish
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Card search scoped to one slot — reuses the listing form's picker. */
function SlotPicker({
  position,
  onPick,
  onCancel,
}: {
  position: string;
  onPick: (card: PlayerCard) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-black">
          <Search className="h-4 w-4 text-primary" />
          {position} uchun o&apos;yinchi
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Bekor qilish"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <CardPicker
        mode="single"
        value={[]}
        onChange={(cards) => {
          if (cards[0]) onPick(cards[0]);
        }}
        placeholder="Masalan: Messi"
      />
    </div>
  );
}

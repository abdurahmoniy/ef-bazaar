'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Save, Search, Sparkles, Users, X } from 'lucide-react';

import {
  DEFAULT_FORMATION,
  DreamTeamPitch,
  FORMATIONS,
  emptySlots,
  reshape,
} from '@/components/marketplace/dream-team-pitch';
import { CardPicker, type PlayerCard } from '@/components/marketplace/card-picker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { saveDreamTeam } from '@/lib/marketplace-actions';
import {
  type DreamTeam,
  type DreamTeamSlot,
} from '@/lib/marketplace-types';
import {
  createDreamTeamDraft,
  DREAM_TEAM_DRAFT_KEY,
  dreamTeamDraftFingerprint,
  parseDreamTeamDraft,
  type DreamTeamDraft,
} from '@/lib/dream-team-draft';
import { writePlayerMatch } from '@/lib/player-match-query';

const MUST_HAVE_WEIGHT = 3;
const TEAM_NAME = 'Mening jamoam';

/**
 * Squad builder: pick a formation, fill 11 slots from the card catalogue, save,
 * then filter the marketplace by how well an account covers it.
 *
 * Slots keep a full card snapshot rather than an id, matching how listings
 * store {@code valuable_players} — the saved squad stays readable even if the
 * catalogue moves under it.
 */
export function DreamTeamEditor({
  initialTeams,
  authenticated,
}: {
  initialTeams: DreamTeam[];
  authenticated: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const first = initialTeams[0] ?? null;
  const [formation, setFormation] = useState(first?.formation ?? DEFAULT_FORMATION);
  const [slots, setSlots] = useState<DreamTeamSlot[]>(
    first ? reshape(first.slots, first.formation) : emptySlots(DEFAULT_FORMATION),
  );
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<DreamTeamDraft | null>(null);
  const initialDraft = createDreamTeamDraft(
    TEAM_NAME,
    first?.formation ?? DEFAULT_FORMATION,
    first?.slots ?? [],
  );
  const [savedFingerprint, setSavedFingerprint] = useState(
    dreamTeamDraftFingerprint(initialDraft),
  );

  const currentDraft = useMemo(
    () => createDreamTeamDraft(TEAM_NAME, formation, slots),
    [formation, slots],
  );
  const currentFingerprint = dreamTeamDraftFingerprint(currentDraft);
  const dirty = currentFingerprint !== savedFingerprint;

  useEffect(() => {
    const restored = parseDreamTeamDraft(window.localStorage.getItem(DREAM_TEAM_DRAFT_KEY));
    if (!restored) return;
    if (new URLSearchParams(window.location.search).get('restore') === 'draft') {
      setFormation(restored.formation);
      setSlots(reshape(restored.slots, restored.formation));
      setNotice('Kirishdan oldingi jamoangiz tiklandi');
    } else {
      setPendingDraft(restored);
    }
  }, []);

  useEffect(() => {
    if (pendingDraft) return;
    if (dirty && currentDraft.slots.length > 0) {
      window.localStorage.setItem(DREAM_TEAM_DRAFT_KEY, JSON.stringify(currentDraft));
    } else if (!dirty) {
      window.localStorage.removeItem(DREAM_TEAM_DRAFT_KEY);
    }
  }, [currentDraft, dirty, pendingDraft]);

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);

  function changeFormation(next: string) {
    setFormation(next);
    // Keep the cards, re-label the positions — switching shape shouldn't wipe
    // the squad the user just built.
    setSlots((prev) => reshape(prev, next));
  }

  function assign(index: number, card: PlayerCard) {
    if (!card.playerId) {
      setError("Bu kartada o'yinchi identifikatori yo'q. Boshqa kartani tanlang.");
      return;
    }
    const duplicate = slots.find((slot, slotIndex) => slotIndex !== index
      && slot.card?.playerId === card.playerId);
    if (duplicate) {
      setError(`${card.name} jamoada allaqachon bor`);
      return;
    }
    setError(null);
    setSlots((prev) =>
      prev.map((slot, i) =>
        i === index
          ? {
              ...slot,
              card: {
                efhubId: card.efhubId,
                playerId: card.playerId,
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
      name: TEAM_NAME,
      formation,
      // Empty slots carry no information and would only bloat the row.
      slots: slots.filter((slot) => slot.card),
    };
    if (!authenticated) {
      window.localStorage.setItem(DREAM_TEAM_DRAFT_KEY, JSON.stringify(currentDraft));
      window.location.assign('/auth/login?from=%2Fdream-team%3Frestore%3Ddraft');
      return;
    }
    startTransition(async () => {
      const result = await saveDreamTeam(payload);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice('Jamoa saqlandi');
      setSavedFingerprint(currentFingerprint);
      window.localStorage.removeItem(DREAM_TEAM_DRAFT_KEY);
      router.refresh();
    });
  }

  const filled = slots.filter((slot) => slot.card).length;
  const browseHref = useMemo(() => {
    const criteria = slots.flatMap((slot) => slot.card?.playerId ? [{
      efhubId: slot.card.efhubId,
      playerId: slot.card.playerId,
      importance: slot.w === MUST_HAVE_WEIGHT ? 'P' as const : 'N' as const,
      name: slot.card.name,
    }] : []);
    const params = writePlayerMatch(new URLSearchParams(), criteria.length
      ? { criteria, strictness: 4 }
      : undefined);
    const query = params.toString();
    return query ? `/marketplace?${query}` : '/marketplace';
  }, [slots]);

  function restorePendingDraft() {
    if (!pendingDraft) return;
    setFormation(pendingDraft.formation);
    setSlots(reshape(pendingDraft.slots, pendingDraft.formation));
    setPendingDraft(null);
    setNotice('Saqlanmagan jamoa tiklandi');
  }

  function discardPendingDraft() {
    window.localStorage.removeItem(DREAM_TEAM_DRAFT_KEY);
    setPendingDraft(null);
  }

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
        {pendingDraft && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-black">Saqlanmagan “{pendingDraft.name}” jamoasi topildi</p>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
              Formatsiya va muhim o&apos;yinchilar bilan davom etishingiz mumkin.
            </p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" onClick={restorePendingDraft}>Tiklash</Button>
              <Button type="button" size="sm" variant="ghost" onClick={discardPendingDraft}>
                Bekor qilish
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black">Mening jamoam</p>
              <p className="text-xs font-semibold text-muted-foreground">
                Bitta jamoani istalgan payt yangilang.
              </p>
            </div>
            <div className="w-32 space-y-1.5 sm:w-40">
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
            {!authenticated ? 'Kirish va saqlash' : 'Saqlash'}
          </Button>
          <Button asChild variant="outline" disabled={filled === 0}>
            <a href={browseHref}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Shu jamoa bo&apos;yicha qidirish
            </a>
          </Button>
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

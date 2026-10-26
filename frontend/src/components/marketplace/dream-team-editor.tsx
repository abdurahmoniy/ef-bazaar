'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check, Flame, Loader2, Save, Search, Sparkles, Star, Trash2, Users, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

import {
  DEFAULT_FORMATION,
  DreamTeamPitch,
  FORMATIONS,
  emptySlots,
  reshape,
} from '@/components/marketplace/dream-team-pitch';
import type { PlayerCard } from '@/components/marketplace/card-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveDreamTeam } from '@/lib/marketplace-actions';
import {
  cardRating,
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
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { writePlayerMatch } from '@/lib/player-match-query';
import { getTelegramWebApp } from '@/lib/telegram';
import { telegramHaptic } from '@/lib/telegram-shell';
import { cn } from '@/lib/utils';

const MUST_HAVE_WEIGHT = 3;
const TEAM_NAME = 'Mening jamoam';
const DEBOUNCE_MS = 200;
const MAX_SEARCH_RESULTS = 24;

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
    // Keep the cards, intelligently re-map by position category
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
    telegramHaptic(getTelegramWebApp(), 'selection', false);
  }

  function clearSlot(index: number) {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, card: undefined } : slot)));
    setEditingSlot(null);
    telegramHaptic(getTelegramWebApp(), 'selection', false);
  }

  function toggleWeight(index: number) {
    setSlots((prev) =>
      prev.map((slot, i) =>
        i === index ? { ...slot, w: (slot.w ?? 1) > 1 ? 1 : MUST_HAVE_WEIGHT } : slot,
      ),
    );
    telegramHaptic(getTelegramWebApp(), 'selection', false);
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
      setNotice('Jamoa muvaffaqiyatli saqlandi!');
      setSavedFingerprint(currentFingerprint);
      window.localStorage.removeItem(DREAM_TEAM_DRAFT_KEY);
      telegramHaptic(getTelegramWebApp(), 'success', false);
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

  const selectedSlot = editingSlot !== null ? slots[editingSlot] ?? null : null;

  return (
    <div className="space-y-4">
      {pendingDraft && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-sm">
          <p className="font-black">Saqlanmagan “{pendingDraft.name}” jamoasi topildi</p>
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
            Formatsiya va muhim o&apos;yinchilar bilan davom etishingiz mumkin.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button type="button" size="sm" onClick={restorePendingDraft} className="font-bold">
              Tiklash
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={discardPendingDraft}>
              Bekor qilish
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-success-border bg-success-soft px-3 py-2 text-sm font-semibold text-success">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        {/* Left Column: Pitch */}
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-black">Formatsiya</p>
              <p className="text-xs font-semibold text-muted-foreground">
                Tarkib joylashuvini tanlang
              </p>
            </div>
            <div className="w-32 sm:w-36">
              <select
                id="team-formation"
                value={formation}
                onChange={(event) => changeFormation(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {Object.keys(FORMATIONS).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DreamTeamPitch
            slots={slots}
            formation={formation}
            onSlotClick={(idx) => setEditingSlot(idx)}
            onClear={clearSlot}
            onToggleWeight={toggleWeight}
          />

          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
            <span>{filled}/11 o&apos;yinchi tanlandi</span>
            <span>Slotni bosib o&apos;yinchi tanlang</span>
          </div>
        </div>

        {/* Right Column: Details & Actions */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="text-base font-black text-foreground">Dream Team haqida</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              O&apos;zingiz xohlagan ideal tarkibni tuzing. Qidiruvda siz tanlagan o&apos;yinchilar soniga qarab
              mos akkountlar saralanadi.
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-warning-soft border border-warning-border p-2.5 text-xs text-warning">
              <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
              <span>
                <strong>Yulduzcha (⭐)</strong> bosilgan o&apos;yinchilar <strong>3×</strong> ustunlikka ega bo&apos;ladi.
              </span>
            </div>
          </div>

          {/* Quick Slot Action List */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Tarkibdagi o&apos;yinchilar ({filled}/11)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
              {slots.map((slot, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setEditingSlot(index)}
                  className={cn(
                    'tap-press flex items-center justify-between rounded-lg border p-2 text-left text-xs transition',
                    slot.card
                      ? 'border-border bg-muted/30 hover:border-primary/50'
                      : 'border-dashed border-border/80 bg-background/50 hover:border-primary/40 text-muted-foreground',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="grid h-6 w-8 shrink-0 place-items-center rounded bg-primary/10 text-[10px] font-black text-primary">
                      {slot.position}
                    </span>
                    <span className="truncate font-bold text-foreground">
                      {slot.card?.name ?? 'Tanlanmagan'}
                    </span>
                  </div>
                  {slot.card && (
                    <div className="flex items-center gap-1 shrink-0">
                      {slot.w === MUST_HAVE_WEIGHT && (
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                      )}
                      <span className="text-[11px] font-black text-muted-foreground">
                        {cardRating(slot.card)}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Main Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <Button
              onClick={save}
              disabled={isPending || filled === 0}
              className="flex-1 font-bold min-h-11"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {!authenticated ? 'Kirish va saqlash' : 'Jamoani saqlash'}
            </Button>
            <Button
              asChild
              variant="outline"
              disabled={filled === 0}
              className="font-bold min-h-11 border-primary/40 hover:border-primary hover:bg-primary/5"
            >
              <a href={browseHref}>
                <Sparkles className="mr-2 h-4 w-4 text-warning" />
                Shu jamoa bo&apos;yicha qidirish
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Modal Slot Picker */}
      <SlotPickerModal
        open={editingSlot !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingSlot(null);
        }}
        slot={selectedSlot}
        allSlots={slots}
        onPick={(card) => {
          if (editingSlot !== null) assign(editingSlot, card);
        }}
        onClear={() => {
          if (editingSlot !== null) clearSlot(editingSlot);
        }}
        onToggleWeight={() => {
          if (editingSlot !== null) toggleWeight(editingSlot);
        }}
      />
    </div>
  );
}

/**
 * Dedicated, accessible Modal dialog for picking/replacing a card in a pitch slot.
 */
function SlotPickerModal({
  open,
  onOpenChange,
  slot,
  allSlots,
  onPick,
  onClear,
  onToggleWeight,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: DreamTeamSlot | null;
  allSlots: DreamTeamSlot[];
  onPick: (card: PlayerCard) => void;
  onClear: () => void;
  onToggleWeight: () => void;
}) {
  const [query, setQuery] = useState('');
  const [metaOnly, setMetaOnly] = useState(false);
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();

  // Load cards on open or search
  useEffect(() => {
    if (!open) {
      setQuery('');
      setMetaOnly(false);
      setCards([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const handle = window.setTimeout(async () => {
      try {
        const url = (metaOnly || trimmed.length < 2)
          ? buildMarketplaceApiPath('v1/cards', new URLSearchParams({
              tier: 'META',
              page: '0',
              size: String(MAX_SEARCH_RESULTS),
            }))
          : buildMarketplaceApiPath('v1/cards/search', new URLSearchParams({
              q: trimmed,
            }));

        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          setCards([]);
          return;
        }

        const payload = (await response.json()) as unknown;
        const items = (metaOnly || trimmed.length < 2) && payload && typeof payload === 'object'
          ? (payload as { items?: unknown }).items
          : payload;

        setCards(
          Array.isArray(items)
            ? (items as PlayerCard[]).filter((c) => c && typeof c.efhubId === 'number' && typeof c.name === 'string')
            : [],
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setCards([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [open, trimmed, metaOnly]);

  const assignedPlayerIds = useMemo(
    () => new Set(allSlots.flatMap((s) => (s !== slot && s.card?.playerId ? [s.card.playerId] : []))),
    [allSlots, slot],
  );

  if (!slot) return null;

  const currentCard = slot.card;
  const isMustHave = (slot.w ?? 1) > 1;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(90dvh,var(--tg-viewport-height,90dvh))] sm:h-[80vh] sm:max-w-2xl sm:inset-0 sm:m-auto flex-col rounded-t-2xl sm:rounded-2xl bg-card shadow-2xl outline-none data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="grid h-7 px-2 place-items-center rounded-md bg-primary text-xs font-black text-primary-foreground">
                {slot.position}
              </span>
              <Dialog.Title className="truncate text-sm font-black text-foreground">
                {slot.position} uchun o&apos;yinchi tanlash
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Yopish"
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            {slot.position} pozitsiyasiga o&apos;yinchi qidiring va tanlang.
          </Dialog.Description>

          {/* Assigned Player Banner (if any) */}
          {currentCard && (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative h-10 w-8 shrink-0 overflow-hidden rounded bg-black/40">
                  {currentCard.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentCard.imageUrl} alt={currentCard.name} className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-foreground">{currentCard.name}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">
                    Hozirgi o&apos;yinchi · {cardRating(currentCard)} OVR
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant={isMustHave ? 'default' : 'outline'}
                  onClick={onToggleWeight}
                  className={cn(
                    'h-8 px-2 text-xs font-bold gap-1',
                    isMustHave && 'bg-amber-400 text-amber-950 hover:bg-amber-300 border-amber-400',
                  )}
                  title="3x ustuvorlik berish"
                >
                  <Star className={cn('h-3.5 w-3.5', isMustHave && 'fill-current')} />
                  {isMustHave ? 'Muhim' : 'Oddiy'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={onClear}
                  className="h-8 px-2 text-xs font-bold gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Olib tashlash
                </Button>
              </div>
            </div>
          )}

          {/* Search Controls */}
          <div className="space-y-2 border-b border-border p-3 shrink-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                type="text"
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setMetaOnly(false);
                }}
                placeholder="O'yinchi ismi bo'yicha qidiring (masalan: Messi)"
                className="h-10 pl-9 pr-8 text-sm"
              />
              {loading && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setMetaOnly((prev) => !prev);
                setQuery('');
              }}
              aria-pressed={metaOnly}
              className={cn(
                'tap-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition',
                metaOnly
                  ? 'border-warning-border bg-warning-soft text-warning'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Flame className="h-3.5 w-3.5 text-warning" />
              {metaOnly ? 'META kartalar filtri yoqilgan' : 'Mashhur META kartalarni ko‘rsatish'}
            </button>
          </div>

          {/* Card Results Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
            {cards.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-bold text-foreground">Karta topilmadi</p>
                <p className="text-xs">Boshqa ism yoki META kartalardan qidiring.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {cards.map((card) => {
                  const isAssignedToOther = card.playerId ? assignedPlayerIds.has(card.playerId) : false;
                  const isCurrent = currentCard?.efhubId === card.efhubId;
                  const rating = cardRating(card);

                  return (
                    <button
                      key={card.efhubId}
                      type="button"
                      disabled={isAssignedToOther}
                      onClick={() => onPick(card)}
                      className={cn(
                        'tap-press relative flex flex-col items-center rounded-xl border p-2 text-center transition select-none',
                        isCurrent
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                          : isAssignedToOther
                            ? 'border-border/50 opacity-40 cursor-not-allowed bg-muted/20'
                            : 'border-border bg-card hover:border-primary hover:bg-muted/30 cursor-pointer shadow-sm',
                      )}
                    >
                      <div className="relative aspect-[12/17] w-full max-w-[85px] overflow-hidden rounded-lg bg-black/30 mb-1.5">
                        {card.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={card.imageUrl}
                            alt={card.name}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center p-1 text-[9px] font-bold text-white">
                            {card.name}
                          </div>
                        )}
                        {typeof rating === 'number' && (
                          <span className="absolute right-0 top-0 rounded-bl bg-primary px-1 text-[10px] font-black text-primary-foreground">
                            {rating}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="absolute inset-0 grid place-items-center bg-primary/40">
                            <Check className="h-6 w-6 text-white" />
                          </span>
                        )}
                      </div>

                      <p className="w-full truncate text-xs font-bold text-foreground" title={card.name}>
                        {card.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                        {card.position && <span>{card.position}</span>}
                        {card.cardType && <span>· {card.cardType}</span>}
                      </div>

                      {isAssignedToOther && (
                        <span className="mt-1 text-[9px] font-bold text-destructive">
                          Jamoada bor
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

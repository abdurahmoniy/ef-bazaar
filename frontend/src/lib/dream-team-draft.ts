import type { AttachedPlayerCard, DreamTeamSlot } from './marketplace-types';

export const DREAM_TEAM_DRAFT_KEY = 'efbazaar:dream-team-draft:v1';
const VERSION = 1 as const;
const FORMATIONS = new Set(['4-3-3', '4-2-3-1', '3-5-2']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DreamTeamDraft {
  version: typeof VERSION;
  name: string;
  formation: string;
  slots: DreamTeamSlot[];
  savedAt: number;
}

export function createDreamTeamDraft(
  name: string,
  formation: string,
  slots: DreamTeamSlot[],
): DreamTeamDraft {
  return {
    version: VERSION,
    name: name.trim().slice(0, 80) || 'Mening jamoam',
    formation,
    slots: slots.filter((slot) => slot.card).map((slot) => ({
      index: slot.index,
      position: slot.position,
      w: slot.w === 3 ? 3 : 1,
      card: sanitizeCard(slot.card!),
    })),
    savedAt: Date.now(),
  };
}

export function parseDreamTeamDraft(raw: string | null): DreamTeamDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DreamTeamDraft>;
    if (value.version !== VERSION || typeof value.name !== 'string'
      || typeof value.formation !== 'string' || !FORMATIONS.has(value.formation)
      || !Array.isArray(value.slots) || value.slots.length > 11
      || typeof value.savedAt !== 'number') return null;
    const indexes = new Set<number>();
    const players = new Set<string>();
    const slots: DreamTeamSlot[] = [];
    for (const rawSlot of value.slots) {
      if (!rawSlot || typeof rawSlot !== 'object') return null;
      const slot = rawSlot as DreamTeamSlot;
      if (!Number.isInteger(slot.index) || slot.index < 0 || slot.index > 10
        || indexes.has(slot.index) || typeof slot.position !== 'string'
        || (slot.w !== 1 && slot.w !== 3) || !validCard(slot.card)) return null;
      if (players.has(slot.card.playerId!)) return null;
      indexes.add(slot.index);
      players.add(slot.card.playerId!);
      slots.push({ ...slot, card: sanitizeCard(slot.card) });
    }
    return {
      version: VERSION,
      name: value.name.trim().slice(0, 80) || 'Mening jamoam',
      formation: value.formation,
      slots,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

export function dreamTeamDraftFingerprint(
  draft: Pick<DreamTeamDraft, 'name' | 'formation' | 'slots'>,
): string {
  return JSON.stringify({
    name: draft.name.trim(),
    formation: draft.formation,
    slots: [...draft.slots]
      .filter((slot) => slot.card)
      .sort((left, right) => left.index - right.index)
      .map((slot) => ({
        index: slot.index,
        w: slot.w === 3 ? 3 : 1,
        efhubId: slot.card!.efhubId,
        playerId: slot.card!.playerId,
      })),
  });
}

function validCard(card: AttachedPlayerCard | undefined): card is AttachedPlayerCard {
  return Boolean(card && Number.isSafeInteger(card.efhubId) && card.efhubId > 0
    && typeof card.playerId === 'string' && UUID.test(card.playerId)
    && typeof card.name === 'string' && card.name.trim());
}

function sanitizeCard(card: AttachedPlayerCard): AttachedPlayerCard {
  return {
    efhubId: card.efhubId,
    playerId: card.playerId,
    name: card.name.slice(0, 160),
    overallRating: card.overallRating,
    maxOverallRating: card.maxOverallRating,
    cardType: card.cardType,
    playingStyle: card.playingStyle,
    position: card.position,
    imageUrl: card.imageUrl,
  };
}

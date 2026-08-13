/**
 * The decision layer for the two actions on an unmatched card credit.
 *
 * **Attributing is irreversible.** `ByCardService.resolveManually` refuses any
 * observation whose status is not `UNMATCHED` (409), so a row can be resolved
 * exactly once — and `LedgerService.post` calls `insertIfAbsent(userId)`, which
 * opens a wallet for *whatever* UUID it is handed without ever asking whether a
 * user with that id exists. There is no screen in this platform that can
 * reverse the posting; undoing it would take a hand-written `ADJUSTMENT`.
 *
 * So a single mistyped character puts real money in a stranger's wallet
 * permanently. That is the entire reason this module exists: a malformed id
 * must be a dead submit button, never a round trip that comes back 400.
 *
 * Dismissing mints nothing, so its note is optional. The asymmetry is
 * deliberate — do not make the two paths symmetric.
 */

export interface ResolveDraft {
  /** Verbatim contents of the user id input. */
  userId: string;
  /** Verbatim contents of the note input. */
  note: string;
}

/** Body of `POST /observations/{id}/resolve` (`ResolveObservationRequest`). */
export interface ResolveRequest {
  userId: string;
  note: string;
}

export interface ResolveDraftReview {
  userIdValid: boolean;
  /** Null while the field is empty — an untouched form should not scold. */
  userIdMessage: string | null;
  noteValid: boolean;
  noteMessage: string | null;
  canSubmit: boolean;
  /**
   * Non-null exactly when `canSubmit`, and the only thing that may be posted.
   * Its `userId` is the normalized id — show *this* in the confirm step, not
   * the raw input, because this is what gets credited.
   */
  request: ResolveRequest | null;
}

export interface IgnoreDraftReview {
  noteMessage: string | null;
  canSubmit: boolean;
  /** Undefined when blank: the backend takes `note` as optional. */
  note: string | undefined;
}

/** Canonical 8-4-4-4-12 hex. Java's `UUID.fromString` also accepts upper case. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Well-formed and yet nobody's: worth catching, since a wallet would open for it. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Backend `@Size(max = 500)` on both notes. */
const NOTE_MAX = 500;

function reviewNoteLength(note: string): string | null {
  return note.length > NOTE_MAX ? `Izoh ${NOTE_MAX} belgidan oshmasligi kerak` : null;
}

function reviewUserId(raw: string): Pick<ResolveDraftReview, 'userIdValid' | 'userIdMessage'> & {
  userId: string;
} {
  const userId = (raw ?? '').trim().toLowerCase();

  if (userId.length === 0) {
    return { userId, userIdValid: false, userIdMessage: null };
  }
  if (!UUID_PATTERN.test(userId)) {
    return {
      userId,
      userIdValid: false,
      userIdMessage: "Foydalanuvchi ID noto'g'ri — 8-4-4-4-12 ko'rinishidagi UUID kutilyapti",
    };
  }
  if (userId === NIL_UUID) {
    return {
      userId,
      userIdValid: false,
      userIdMessage: 'Bu ID hech qanday foydalanuvchiga tegishli emas',
    };
  }
  return { userId, userIdValid: true, userIdMessage: null };
}

export function reviewResolveDraft(draft: ResolveDraft): ResolveDraftReview {
  const { userId, userIdValid, userIdMessage } = reviewUserId(draft.userId);

  const rawNote = draft.note ?? '';
  const note = rawNote.trim();
  const tooLong = reviewNoteLength(note);
  // Blank while untouched is silent; blank after typing whitespace is not.
  const noteMessage = tooLong
    ?? (rawNote.length > 0 && note.length === 0
      ? "Izoh majburiy — pul nima uchun biriktirilayotganini yozing"
      : null);
  const noteValid = note.length > 0 && tooLong === null;

  const canSubmit = userIdValid && noteValid;

  return {
    userIdValid,
    userIdMessage,
    noteValid,
    noteMessage,
    canSubmit,
    request: canSubmit ? { userId, note } : null,
  };
}

export function reviewIgnoreDraft(rawNote: string): IgnoreDraftReview {
  const note = (rawNote ?? '').trim();
  const noteMessage = reviewNoteLength(note);

  return {
    noteMessage,
    canSubmit: noteMessage === null,
    note: note.length > 0 ? note : undefined,
  };
}

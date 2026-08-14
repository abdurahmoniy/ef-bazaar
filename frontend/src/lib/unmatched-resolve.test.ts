import { describe, expect, it } from 'vitest';

import { reviewIgnoreDraft, reviewResolveDraft } from './unmatched-resolve';

/** A real-shaped v4 id. Nothing here depends on the version nibble. */
const USER_ID = '3f1a7c2e-9b04-4d5f-8a61-0c2e5d7b9f13';

describe('reviewResolveDraft', () => {
  it('stays silent on an untouched form but refuses to submit', () => {
    const review = reviewResolveDraft({ userId: '', note: '' });
    expect(review.userIdMessage).toBeNull();
    expect(review.noteMessage).toBeNull();
    expect(review.canSubmit).toBe(false);
    expect(review.request).toBeNull();
  });

  /**
   * The whole point of this module. `resolveManually` credits whatever UUID it
   * is handed — `LedgerService` calls `insertIfAbsent(userId)`, so a wrong but
   * well-formed id silently opens a wallet for a stranger — and the row can
   * never be resolved again. A typo must die in the form.
   */
  it('rejects an id that is not a UUID', () => {
    const review = reviewResolveDraft({ userId: '3f1a7c2e-9b04', note: 'karta orqali keldi' });
    expect(review.userIdValid).toBe(false);
    expect(review.userIdMessage).toContain("noto'g'ri");
    expect(review.canSubmit).toBe(false);
    expect(review.request).toBeNull();
  });

  it('rejects an id with a non-hex character', () => {
    const review = reviewResolveDraft({
      userId: '3f1a7c2e-9b04-4d5f-8a61-0c2e5d7b9f1z',
      note: 'izoh',
    });
    expect(review.userIdValid).toBe(false);
  });

  it('rejects an id that is one character too long', () => {
    const review = reviewResolveDraft({ userId: `${USER_ID}4`, note: 'izoh' });
    expect(review.userIdValid).toBe(false);
  });

  /** Well-formed, but no user is ever born with it. */
  it('rejects the nil UUID', () => {
    const review = reviewResolveDraft({
      userId: '00000000-0000-0000-0000-000000000000',
      note: 'izoh',
    });
    expect(review.userIdValid).toBe(false);
    expect(review.userIdMessage).not.toBeNull();
  });

  it('accepts a pasted id with stray whitespace and upper case, normalized', () => {
    const review = reviewResolveDraft({
      userId: `  ${USER_ID.toUpperCase()}\n`,
      note: '  Telegramda tasdiqladi  ',
    });
    expect(review.userIdValid).toBe(true);
    expect(review.userIdMessage).toBeNull();
    expect(review.canSubmit).toBe(true);
    expect(review.request).toEqual({ userId: USER_ID, note: 'Telegramda tasdiqladi' });
  });

  /** Backend `@NotBlank`, and a note is the only record of why money appeared. */
  it('refuses a whitespace-only note', () => {
    const review = reviewResolveDraft({ userId: USER_ID, note: '   ' });
    expect(review.noteValid).toBe(false);
    expect(review.noteMessage).toContain('Izoh');
    expect(review.canSubmit).toBe(false);
  });

  it('does not scold about the note before anything is typed', () => {
    const review = reviewResolveDraft({ userId: USER_ID, note: '' });
    expect(review.noteMessage).toBeNull();
    expect(review.canSubmit).toBe(false);
  });

  /** Backend `@Size(max = 500)` — a 400 the admin should never have to see. */
  it('refuses a note longer than 500 characters', () => {
    const review = reviewResolveDraft({ userId: USER_ID, note: 'a'.repeat(501) });
    expect(review.noteValid).toBe(false);
    expect(review.noteMessage).toContain('500');
    expect(review.canSubmit).toBe(false);
  });

  it('allows a note of exactly 500 characters', () => {
    const review = reviewResolveDraft({ userId: USER_ID, note: 'a'.repeat(500) });
    expect(review.noteValid).toBe(true);
    expect(review.canSubmit).toBe(true);
  });

  it('counts the trimmed note against the limit, not the padding', () => {
    const review = reviewResolveDraft({ userId: USER_ID, note: `  ${'a'.repeat(500)}  ` });
    expect(review.canSubmit).toBe(true);
    expect(review.request?.note).toBe('a'.repeat(500));
  });

  it('never builds a request unless it may be submitted', () => {
    for (const draft of [
      { userId: '', note: 'izoh' },
      { userId: 'not-a-uuid', note: 'izoh' },
      { userId: USER_ID, note: '' },
      { userId: USER_ID, note: ' ' },
    ]) {
      const review = reviewResolveDraft(draft);
      expect(review.canSubmit).toBe(false);
      expect(review.request).toBeNull();
    }
  });
});

describe('reviewIgnoreDraft', () => {
  /**
   * Deliberately asymmetric with resolve: dismissing mints nothing, so an
   * empty note is fine.
   */
  it('lets an empty note through and sends nothing', () => {
    const review = reviewIgnoreDraft('');
    expect(review.canSubmit).toBe(true);
    expect(review.note).toBeUndefined();
    expect(review.noteMessage).toBeNull();
  });

  it('treats a whitespace-only note as no note', () => {
    expect(reviewIgnoreDraft('   ').note).toBeUndefined();
  });

  it('trims a real note', () => {
    expect(reviewIgnoreDraft('  spam xabar  ').note).toBe('spam xabar');
  });

  it('refuses a note longer than 500 characters', () => {
    const review = reviewIgnoreDraft('a'.repeat(501));
    expect(review.canSubmit).toBe(false);
    expect(review.noteMessage).toContain('500');
  });
});

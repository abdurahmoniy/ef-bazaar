import { describe, expect, it } from 'vitest';

import {
  createDreamTeamDraft,
  dreamTeamDraftFingerprint,
  parseDreamTeamDraft,
} from './dream-team-draft';

describe('dream team draft', () => {
  it('round-trips formation, canonical card identity, and priority', () => {
    const draft = createDreamTeamDraft('My XI', '4-2-3-1', [{
      index: 8,
      position: 'AMF',
      w: 3,
      card: {
        efhubId: 10,
        playerId: 'd3afc71a-85bd-4cce-952c-86649894ad54',
        name: 'Messi',
        maxOverallRating: 106,
      },
    }]);

    expect(parseDreamTeamDraft(JSON.stringify(draft))).toEqual(draft);
    expect(draft.slots[0]).toMatchObject({ index: 8, w: 3 });
  });

  it('rejects stale, malformed, legacy-identity, and unsupported drafts', () => {
    expect(parseDreamTeamDraft('nope')).toBeNull();
    expect(parseDreamTeamDraft(JSON.stringify({ version: 2 }))).toBeNull();
    expect(parseDreamTeamDraft(JSON.stringify(createDreamTeamDraft('x', '5-5-0', [])))).toBeNull();
    expect(parseDreamTeamDraft(JSON.stringify({
      ...createDreamTeamDraft('x', '4-3-3', []),
      slots: [{ index: 0, position: 'GK', w: 1, card: { efhubId: 10, name: 'Legacy' } }],
    }))).toBeNull();
  });

  it('uses a stable fingerprint for unsaved-change comparisons', () => {
    const one = createDreamTeamDraft('  My XI ', '4-3-3', []);
    const two = { ...one, savedAt: one.savedAt + 100 };
    expect(dreamTeamDraftFingerprint(one)).toBe(dreamTeamDraftFingerprint(two));
  });
});

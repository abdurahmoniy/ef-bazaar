import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./dream-team-editor.tsx', import.meta.url), 'utf8');

describe('DreamTeamEditor singleton contract', () => {
  it('edits and saves one fixed user team without create/delete controls', () => {
    expect(source).toContain("const TEAM_NAME = 'Mening jamoam';");
    expect(source).toContain('await saveDreamTeam(payload)');
    expect(source).not.toContain('createDreamTeam(');
    expect(source).not.toContain('deleteDreamTeam(');
    expect(source).not.toContain('updateDreamTeam(');
    expect(source).not.toContain('Yangi');
    expect(source).not.toContain('O&apos;chirish');
    expect(source).not.toContain('Jamoa nomi');
  });
});

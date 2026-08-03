import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./admin-players.tsx', import.meta.url), 'utf8');

describe('AdminPlayers META lifecycle contract', () => {
  it('supports priority, scheduled windows, reason, expiry, and clearing', () => {
    expect(source).toContain('Priority');
    expect(source).toContain('META boshlanish vaqti');
    expect(source).toContain('META tugash vaqti');
    expect(source).toContain('Sabab (masalan: turnir metasi)');
    expect(source).toContain('Hozir tugatish');
    expect(source).toContain('Lifecycle tozalash');
  });

  it('shows informational 7 and 30 day demand without automatic promotion', () => {
    expect(source).toContain('card.interest7d');
    expect(source).toContain('card.interest30d');
    expect(source).toContain("demandSort === '7d'");
    expect(source).not.toContain('interest7d >');
  });
});

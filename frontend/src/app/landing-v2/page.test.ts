import { describe, expect, it, vi } from 'vitest';

const { permanentRedirect } = vi.hoisted(() => ({
  permanentRedirect: vi.fn((path: string) => { throw new Error(`permanentRedirect:${path}`); }),
}));
vi.mock('next/navigation', () => ({ permanentRedirect }));

import LandingV2Page from './page';

describe('former landing v2 URL', () => {
  it('permanently redirects existing bookmarks to the published homepage', () => {
    expect(() => LandingV2Page()).toThrow('permanentRedirect:/');
    expect(permanentRedirect).toHaveBeenCalledWith('/');
  });
});

// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminMusic } from './admin-music';
import { createMusicTrack, deleteMusicTrack, listAdminMusicTracks, updateMusicTrack } from '@/lib/music';
import type { MusicTrack } from '@/lib/music';

vi.mock('@/lib/music', async (original) => ({
  ...await original<typeof import('@/lib/music')>(),
  listAdminMusicTracks: vi.fn(),
  createMusicTrack: vi.fn(),
  updateMusicTrack: vi.fn(),
  deleteMusicTrack: vi.fn(),
}));

const track: MusicTrack = {
  id: 'track-1',
  title: 'Matchday',
  artist: 'Artist',
  youtubeVideoId: 'abcdefghijk',
  sortOrder: 2,
  enabled: true,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(listAdminMusicTracks).mockResolvedValue([]);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render() {
  await act(async () => root.render(createElement(AdminMusic)));
}

async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((element) => element.textContent?.trim() === label || element.getAttribute('aria-label') === label);
  expect(found, `Button ${label}`).toBeDefined();
  return found!;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

async function submit() {
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

describe('AdminMusic', () => {
  it('adds an enabled track from a YouTube URL, then refreshes the list', async () => {
    await render();
    expect(container.textContent).toContain('Hali musiqa qo‘shilmagan');
    expect(container.querySelector('iframe, video, audio')).toBeNull();
    await fill('music-title', '  Matchday  ');
    await fill('music-artist', '  Artist  ');
    await fill('music-url', 'https://youtu.be/abcdefghijk');
    await fill('music-order', '2');
    vi.mocked(createMusicTrack).mockResolvedValue(track);
    vi.mocked(listAdminMusicTracks).mockResolvedValue([track]);

    await submit();

    expect(createMusicTrack).toHaveBeenCalledWith({
      title: 'Matchday', artist: 'Artist', youtubeUrl: 'https://youtu.be/abcdefghijk', sortOrder: 2, enabled: true,
    });
    expect(container.textContent).toContain('Matchday');
    expect(container.textContent).toContain('Faol');
    expect(container.querySelector<HTMLInputElement>('#music-title')!.value).toBe('');
    expect(container.querySelector('a[href="https://www.youtube.com/watch?v=abcdefghijk"]')).not.toBeNull();
  });

  it('edits metadata and disables a track, or cancels without writing', async () => {
    vi.mocked(listAdminMusicTracks).mockResolvedValue([track]);
    await render();
    await click('Matchday — tahrirlash');
    expect(container.querySelector<HTMLInputElement>('#music-url')!.value).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    await fill('music-title', 'Cancelled');
    await click('Bekor qilish');
    expect(updateMusicTrack).not.toHaveBeenCalled();

    await click('Matchday — tahrirlash');
    await fill('music-title', 'Updated');
    await fill('music-order', '7');
    await act(async () => container.querySelector<HTMLInputElement>('#music-enabled')!.click());
    const updated = { ...track, title: 'Updated', sortOrder: 7, enabled: false };
    vi.mocked(updateMusicTrack).mockResolvedValue(updated);
    vi.mocked(listAdminMusicTracks).mockResolvedValue([updated]);

    await submit();

    expect(updateMusicTrack).toHaveBeenCalledWith(track.id, {
      title: 'Updated', artist: 'Artist', youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk', sortOrder: 7, enabled: false,
    });
    expect(createMusicTrack).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Nofaol');
    expect(container.textContent).toContain('Updated');
  });

  it('requires confirmation before deleting and preserves the row when deletion fails', async () => {
    vi.mocked(listAdminMusicTracks).mockResolvedValue([track]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await render();
    await click('Matchday — o‘chirish');
    expect(deleteMusicTrack).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    vi.mocked(deleteMusicTrack).mockRejectedValueOnce(new Error('O‘chirish amalga oshmadi'));
    await click('Matchday — o‘chirish');
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('O‘chirish amalga oshmadi');
    expect(container.textContent).toContain('Matchday');

    vi.mocked(deleteMusicTrack).mockResolvedValueOnce(undefined);
    vi.mocked(listAdminMusicTracks).mockResolvedValue([]);
    await click('Matchday — o‘chirish');
    expect(deleteMusicTrack).toHaveBeenLastCalledWith(track.id);
    expect(container.textContent).toContain('Hali musiqa qo‘shilmagan');
  });

  it('keeps the draft after a save failure and prevents duplicate requests while saving', async () => {
    await render();
    await fill('music-title', 'Matchday');
    await fill('music-url', 'https://youtu.be/abcdefghijk');
    let rejectSave!: (error: Error) => void;
    vi.mocked(createMusicTrack).mockImplementation(() => new Promise((_, reject) => { rejectSave = reject; }));

    await submit();
    expect(button('Saqlanmoqda…').disabled).toBe(true);
    await submit();
    expect(createMusicTrack).toHaveBeenCalledTimes(1);
    await act(async () => rejectSave(new Error('YouTube havolasi noto‘g‘ri')));

    expect(container.querySelector('[role="alert"]')!.textContent).toContain('YouTube havolasi noto‘g‘ri');
    expect(container.querySelector<HTMLInputElement>('#music-title')!.value).toBe('Matchday');
    expect(button('Musiqa qo‘shish').disabled).toBe(false);
  });

  it('offers a retry for a failed load and does not present the failure as an empty playlist', async () => {
    vi.mocked(listAdminMusicTracks).mockRejectedValueOnce(new Error('Ro‘yxat yuklanmadi'));
    await render();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Ro‘yxat yuklanmadi');
    expect(container.textContent).not.toContain('Hali musiqa qo‘shilmagan');
    vi.mocked(listAdminMusicTracks).mockResolvedValue([track]);

    await click('Qayta urinish');

    expect(container.textContent).toContain('Matchday');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not submit blank titles or fractional ordering', async () => {
    await render();
    await fill('music-title', '   ');
    await fill('music-url', 'https://youtu.be/abcdefghijk');
    await submit();
    expect(createMusicTrack).not.toHaveBeenCalled();
    await fill('music-title', 'Matchday');
    await fill('music-order', '1.5');
    await submit();
    expect(createMusicTrack).not.toHaveBeenCalled();
  });
});

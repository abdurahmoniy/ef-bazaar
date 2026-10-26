import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMusicTrack,
  deleteMusicTrack,
  listAdminMusicTracks,
  listMusicTracks,
  musicVideoUrl,
  updateMusicTrack,
  type MusicTrackInput,
} from './music';

const track = {
  id: 'track-1',
  title: 'Matchday',
  artist: 'Artist',
  youtubeVideoId: 'abcdefghijk',
  sortOrder: 2,
  enabled: true,
};
const input: MusicTrackInput = {
  title: track.title,
  artist: track.artist,
  youtubeUrl: 'https://youtu.be/abcdefghijk',
  sortOrder: track.sortOrder,
  enabled: track.enabled,
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('music API', () => {
  it('loads the public playlist without a cached response and passes cancellation through', async () => {
    fetchMock.mockResolvedValue(Response.json([track]));
    const controller = new AbortController();

    await expect(listMusicTracks(controller.signal)).resolves.toEqual([track]);
    expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/music', expect.objectContaining({
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    }));
  });

  it('loads all admin tracks using the current session', async () => {
    fetchMock.mockResolvedValue(Response.json([{ ...track, enabled: false }]));

    await expect(listAdminMusicTracks()).resolves.toEqual([{ ...track, enabled: false }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/admin/music', expect.objectContaining({
      credentials: 'include',
      cache: 'no-store',
    }));
  });

  it('creates a track with the YouTube URL and all editable metadata', async () => {
    fetchMock.mockResolvedValue(Response.json(track, { status: 201 }));

    await expect(createMusicTrack(input)).resolves.toEqual(track);
    expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/admin/music', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('updates title, source, ordering and disabled state together', async () => {
    const update = { ...input, title: 'Updated', enabled: false, sortOrder: 5 };
    fetchMock.mockResolvedValue(Response.json({ ...track, ...update }));

    await updateMusicTrack('track ?1', update);
    expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/admin/music/track%20%3F1', {
      method: 'PUT',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  });

  it('deletes a track without parsing an empty success response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteMusicTrack(track.id)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/admin/music/track-1', {
      method: 'DELETE',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  });

  it('surfaces validation and permission failures instead of reporting success', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'YouTube havolasi noto‘g‘ri' }, { status: 400 }));
    await expect(createMusicTrack(input)).rejects.toThrow('YouTube havolasi noto‘g‘ri');

    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Forbidden' }, { status: 403 }));
    await expect(deleteMusicTrack(track.id)).rejects.toThrow('Forbidden');

    fetchMock.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
    await expect(listMusicTracks()).rejects.toThrow('Xatolik (503)');
  });

  it('creates a canonical YouTube link for editing and inspection', () => {
    expect(musicVideoUrl('abcdefghijk')).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  });
});

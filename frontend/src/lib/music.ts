import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  youtubeVideoId: string;
  sortOrder: number;
  enabled: boolean;
}

export interface MusicTrackInput {
  title: string;
  artist: string;
  youtubeUrl: string;
  sortOrder: number;
  enabled: boolean;
}

function adminPath(id?: string): string {
  return buildMarketplaceApiPath(['v1', 'admin', 'music', ...(id ? [id] : [])]);
}

async function request(path: string, options: RequestInit): Promise<Response> {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `Xatolik (${response.status})`;
    try {
      const payload = await response.json();
      const detail = payload?.message || payload?.error;
      if (typeof detail === 'string' && detail) message = detail;
    } catch {
      // Proxy failures may have a plain-text or empty response body.
    }
    throw new Error(message);
  }
  return response;
}

export async function listMusicTracks(signal?: AbortSignal): Promise<MusicTrack[]> {
  const response = await request(buildMarketplaceApiPath(['v1', 'music']), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  return response.json();
}

export async function listAdminMusicTracks(): Promise<MusicTrack[]> {
  const response = await request(adminPath(), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  });
  return response.json();
}

async function saveTrack(path: string, method: 'POST' | 'PUT', input: MusicTrackInput): Promise<MusicTrack> {
  const response = await request(path, {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json();
}

export function createMusicTrack(input: MusicTrackInput): Promise<MusicTrack> {
  return saveTrack(adminPath(), 'POST', input);
}

export function updateMusicTrack(id: string, input: MusicTrackInput): Promise<MusicTrack> {
  return saveTrack(adminPath(id), 'PUT', input);
}

export async function deleteMusicTrack(id: string): Promise<void> {
  await request(adminPath(id), {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
}

export function musicVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

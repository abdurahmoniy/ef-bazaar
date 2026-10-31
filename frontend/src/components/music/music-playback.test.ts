import { describe, expect, it, vi } from 'vitest';

import { MusicPlayback, musicAllowedOnPath } from './music-playback';

const tracks = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'].map((youtubeVideoId, index) => ({
  id: String(index), title: `Track ${index}`, artist: '', youtubeVideoId, sortOrder: index, enabled: true,
}));

function setup(random = () => 0) {
  const player = {
    loadVideoById: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), stopVideo: vi.fn(),
    setVolume: vi.fn(), unMute: vi.fn(), isMuted: vi.fn().mockReturnValue(false),
  };
  const playback = new MusicPlayback(player, random);
  return { player, playback };
}

describe('background music playback', () => {
  it('waits for readiness and an allowed page, then starts quietly', () => {
    const { playback, player } = setup();
    playback.setTracks(tracks);
    playback.setAllowed(true);
    expect(player.loadVideoById).not.toHaveBeenCalled();
    playback.ready();
    expect(player.setVolume).toHaveBeenCalledWith(20);
    expect(player.unMute).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('plays every track once per shuffled cycle without adjacent repeats', () => {
    const { playback, player } = setup();
    playback.setTracks(tracks);
    playback.setAllowed(true);
    playback.ready();
    for (let index = 0; index < 11; index++) playback.stateChanged(0);
    const ids = player.loadVideoById.mock.calls.map(([id]) => id);
    expect(ids[0]).not.toBe(tracks[0].youtubeVideoId);
    for (let index = 0; index < ids.length; index += 3) {
      expect(new Set(ids.slice(index, index + 3)).size).toBe(3);
    }
    expect(ids.every((id, index) => index === 0 || id !== ids[index - 1])).toBe(true);
  });

  it('replays a single enabled track when it ends', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks.slice(0, 1));
    playback.ready();
    playback.stateChanged(0);
    expect(player.loadVideoById.mock.calls).toEqual([['aaaaaaaaaaa'], ['aaaaaaaaaaa']]);
  });

  it('does not restart audio on metadata refreshes or ordinary navigation', () => {
    const { playback, player } = setup();
    playback.setTracks(tracks);
    playback.setAllowed(true);
    playback.ready();
    playback.stateChanged(1);
    playback.setTracks(tracks.map(track => ({ ...track, title: 'Updated title' })));
    playback.setAllowed(true);
    playback.interact();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it('retries blocked autoplay on interaction without restarting the track', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks);
    playback.ready();
    playback.autoplayBlocked();
    playback.interact();
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('restores volume and unmutes during interaction after a blocked audible start', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks);
    playback.ready();
    playback.autoplayBlocked();
    player.unMute.mockClear();
    player.setVolume.mockClear();
    playback.interact();
    expect(player.setVolume).toHaveBeenCalledWith(20);
    expect(player.unMute).toHaveBeenCalledOnce();
    expect(player.unMute.mock.invocationCallOrder[0]).toBeLessThan(player.playVideo.mock.invocationCallOrder[0]);
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('unmutes an already running muted video without restarting playback', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks);
    playback.ready();
    playback.stateChanged(1);
    player.isMuted.mockReturnValue(true);
    player.unMute.mockClear();
    playback.interact();
    expect(player.unMute).toHaveBeenCalledOnce();
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('leaves audible playback alone on later page interactions', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks);
    playback.ready();
    playback.stateChanged(1);
    player.unMute.mockClear();
    player.setVolume.mockClear();
    playback.interact();
    expect(player.unMute).not.toHaveBeenCalled();
    expect(player.setVolume).not.toHaveBeenCalled();
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('pauses when hidden or on a quiet route and resumes the same track', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks);
    playback.ready();
    playback.stateChanged(1);
    playback.setAllowed(false);
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    playback.interact();
    expect(player.playVideo).not.toHaveBeenCalled();
    // An asynchronous play event after navigation must not leak audio.
    playback.stateChanged(1);
    expect(player.pauseVideo).toHaveBeenCalledTimes(2);
    playback.setAllowed(true);
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('defers an ended track until the site becomes active again', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks);
    playback.ready();
    playback.setAllowed(false);
    playback.stateChanged(0);
    expect(player.loadVideoById).toHaveBeenCalledOnce();
    playback.setAllowed(true);
    expect(player.loadVideoById).toHaveBeenCalledTimes(2);
  });

  it('skips unavailable videos and stops after exhausting the playlist', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks);
    playback.ready();
    playback.failed();
    playback.failed();
    playback.failed();
    playback.failed();
    playback.interact();
    playback.setTracks(tracks.map(track => ({ ...track })));
    expect(player.loadVideoById).toHaveBeenCalledTimes(3);
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(player.stopVideo).toHaveBeenCalled();
  });

  it('does not repeat the last audible song after an unavailable video is skipped', () => {
    const samples = [0, 0, 0.99, 0];
    const { playback, player } = setup(() => samples.shift() ?? 0);
    playback.setAllowed(true);
    playback.setTracks(tracks);
    playback.ready();
    for (let index = 0; index < 3; index++) {
      playback.stateChanged(1);
      playback.stateChanged(0);
    }
    expect(player.loadVideoById.mock.calls.map(([id]) => id)).toEqual([
      'bbbbbbbbbbb', 'ccccccccccc', 'aaaaaaaaaaa', 'bbbbbbbbbbb',
    ]);
    playback.failed();
    expect(player.loadVideoById).toHaveBeenLastCalledWith('ccccccccccc');
  });

  it('plays a newly added track after previously available videos all failed', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks.slice(0, 1));
    playback.ready();
    playback.failed();
    playback.setTracks(tracks);
    expect(player.loadVideoById).toHaveBeenCalledTimes(2);
    expect(player.loadVideoById.mock.lastCall?.[0]).not.toBe('aaaaaaaaaaa');
  });

  it('immediately stops a disabled or removed current track', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks.slice(0, 1));
    playback.ready();
    playback.setTracks([{ ...tracks[0], enabled: false }]);
    expect(player.stopVideo).toHaveBeenCalledOnce();
    playback.interact();
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it('loads the new video if an admin replaces the currently playing URL', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.setTracks(tracks.slice(0, 1));
    playback.ready();
    playback.setTracks([{ ...tracks[0], youtubeVideoId: 'ddddddddddd' }]);
    expect(player.stopVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenLastCalledWith('ddddddddddd');
  });

  it('stays silent for an empty playlist and starts when the first track arrives', () => {
    const { playback, player } = setup();
    playback.setAllowed(true);
    playback.ready();
    playback.interact();
    expect(player.loadVideoById).not.toHaveBeenCalled();
    expect(player.playVideo).not.toHaveBeenCalled();
    playback.setTracks(tracks);
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it.each(['/admin', '/admin/music', '/support', '/auth/login'])('keeps %s quiet', path => {
    expect(musicAllowedOnPath(path)).toBe(false);
  });

  it.each(['/', '/marketplace', '/chats', '/chats/42', '/plans', '/profile', '/trade-admins'])('permits music on %s', path => {
    expect(musicAllowedOnPath(path)).toBe(true);
  });
});

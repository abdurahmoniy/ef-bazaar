import type { MusicTrack } from '@/lib/music';

export interface MusicPlayer {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  setVolume(volume: number): void;
  unMute(): void;
  isMuted(): boolean;
}

export function musicAllowedOnPath(path: string): boolean {
  return !['/admin', '/chats', '/support', '/auth'].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

/** Keeps playback independent of React renders, route changes and catalog refreshes. */
export class MusicPlayback {
  private tracks: MusicTrack[] = [];
  private queue: string[] = [];
  private current: MusicTrack | null = null;
  private lastPlayedId: string | null = null;
  private unavailable = new Set<string>();
  private isReady = false;
  private allowed = false;
  private playing = false;
  private ended = false;

  constructor(private player: MusicPlayer, private random: () => number = Math.random) {}

  ready() {
    if (this.isReady) return;
    this.isReady = true;
    this.player.setVolume(20);
    this.player.unMute();
    if (this.allowed) this.advance();
  }

  setTracks(tracks: MusicTrack[]) {
    const seen = new Set<string>();
    this.tracks = tracks.filter(track => {
      if (!track.enabled || seen.has(track.youtubeVideoId)) return false;
      seen.add(track.youtubeVideoId);
      return true;
    });
    this.queue = this.queue.filter(id => this.tracks.some(track => track.id === id));
    // A periodic refetch must not turn failed videos into an endless retry loop.
    this.unavailable = new Set([...this.unavailable].filter(id => seen.has(id)));
    if (this.current && !this.tracks.some(track => track.id === this.current?.id
      && track.youtubeVideoId === this.current.youtubeVideoId)) {
      this.current = null;
      this.playing = false;
      if (this.isReady) this.player.stopVideo();
    }
    if (!this.current && this.isReady && this.allowed) this.advance();
  }

  setAllowed(allowed: boolean) {
    if (this.allowed === allowed) return;
    this.allowed = allowed;
    if (!this.isReady) return;
    if (!allowed) {
      this.playing = false;
      this.player.pauseVideo();
    } else if (!this.current || this.ended) {
      this.advance();
    } else {
      this.player.playVideo();
    }
  }

  interact() {
    if (!this.isReady || !this.allowed || !this.current) return;
    if (this.playing && !this.player.isMuted()) return;
    // Mobile Chrome can reject the initial audible start or leave it muted.
    // Restore audio synchronously in the user's click/key event, before play.
    this.player.setVolume(20);
    this.player.unMute();
    if (!this.playing) this.player.playVideo();
  }

  autoplayBlocked() {
    this.playing = false;
  }

  stateChanged(state: number) {
    this.playing = state === 1;
    if (this.playing && this.allowed && this.current) this.lastPlayedId = this.current.id;
    if (this.playing && !this.allowed) {
      this.playing = false;
      this.player.pauseVideo();
    }
    if (state === 0 && this.current) {
      this.ended = true;
      if (this.allowed) this.advance();
    }
  }

  failed() {
    if (!this.current) return;
    this.unavailable.add(this.current.youtubeVideoId);
    this.current = null;
    this.playing = false;
    this.player.stopVideo();
    if (this.allowed) this.advance();
  }

  private advance() {
    const eligible = this.tracks.filter(track => !this.unavailable.has(track.youtubeVideoId));
    this.queue = this.queue.filter(id => eligible.some(track => track.id === id));
    if (!this.queue.length) {
      this.queue = eligible.map(track => track.id);
      for (let index = this.queue.length - 1; index > 0; index--) {
        const other = Math.floor(this.random() * (index + 1));
        [this.queue[index], this.queue[other]] = [this.queue[other], this.queue[index]];
      }
    }
    // A failed load must not erase the identity of the last audible song.
    const previous = this.lastPlayedId ?? this.current?.id;
    if (eligible.length > 1 && this.queue[0] === previous) {
      const alternative = this.queue.findIndex(id => id !== previous);
      if (alternative > 0) {
        [this.queue[0], this.queue[alternative]] = [this.queue[alternative], this.queue[0]];
      } else {
        this.queue.unshift(eligible.find(track => track.id !== previous)!.id);
      }
    }
    const next = this.queue.shift();
    this.current = eligible.find(track => track.id === next) ?? null;
    this.playing = false;
    this.ended = false;
    if (this.current) this.player.loadVideoById(this.current.youtubeVideoId);
  }
}

// Self-contained so the head script can run this before the React bundle loads.
export function createStartupSoundBinding() {
  const owners = new WeakMap<HTMLAudioElement, object>();

  /** Play only the remaining portion of the intro, never a late or looping cue. */
  function bindStartupSound(overlay: HTMLElement, audio: HTMLAudioElement): () => void {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const attachedAt = performance.now();
    let finished = false;
    let disposed = false;

    const elapsed = () => {
      const time = overlay.getAnimations?.()[0]?.currentTime;
      return typeof time === 'number' ? time / 1000 : (performance.now() - attachedAt) / 1000;
    };
    const canPlay = () => {
      if (disposed || finished || document.documentElement.dataset.startupIntro !== 'playing'
        || document.visibilityState === 'hidden' || preference.matches || elapsed() >= 6) return false;
      const style = getComputedStyle(overlay);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    if (!canPlay()) return () => {};
    // A previous binding may still have an unresolved play promise.
    const owner = {};
    owners.set(audio, owner);

    const stop = () => {
      finished = true;
      if (owners.get(audio) === owner) audio.pause();
      cleanup();
    };
    const sync = () => {
      if (!canPlay()) { stop(); return; }
      // Metadata/network latency must not move the opening hit past the logo reveal.
      try {
        const position = elapsed();
        if (Math.abs(audio.currentTime - position) > 0.12) audio.currentTime = position;
      } catch {
        // Some engines cannot seek until metadata is available. Retry on playing.
      }
    };
    const failed = (error: unknown) => {
      if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') stop();
    };
    const play = () => {
      if (!canPlay() || !audio.paused) return;
      sync();
      try { void audio.play().then(sync, failed); } catch { stop(); }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') stop(); };
    const onPreference = () => { if (preference.matches) stop(); };
    const observer = new MutationObserver(() => {
      if (!overlay.isConnected || document.documentElement.dataset.startupIntro !== 'playing') stop();
    });

    audio.volume = 0.6;
    audio.addEventListener('playing', sync);
    audio.addEventListener('ended', stop);
    audio.addEventListener('error', stop);
    // A native click includes touch taps and preserves the browser's user gesture.
    overlay.addEventListener('click', play);
    document.addEventListener('visibilitychange', onVisibility);
    preference.addEventListener('change', onPreference);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-startup-intro'], childList: true, subtree: true });
    const deadline = window.setTimeout(stop, Math.max(0, (6 - elapsed()) * 1000));

    const cleanup = () => {
      window.clearTimeout(deadline);
      observer.disconnect();
      overlay.removeEventListener('click', play);
      document.removeEventListener('visibilitychange', onVisibility);
      preference.removeEventListener('change', onPreference);
      audio.removeEventListener('playing', sync);
      audio.removeEventListener('ended', stop);
      audio.removeEventListener('error', stop);
    };
    play();

    return () => {
      disposed = true;
      stop();
    };
  }
  return bindStartupSound;
}

export const bindStartupSound = createStartupSoundBinding();

'use client';

import { useEffect, useState } from 'react';

/**
 * Reactive media query. Use it only when the two branches must render
 * *different DOM* — moving a node to another parent, say. Anything that is
 * purely a style difference belongs in a Tailwind responsive class, which
 * costs no JS and is correct before hydration.
 *
 * Returns false on the server and until the first effect runs, so callers that
 * render on the server must tolerate the narrow branch appearing first.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

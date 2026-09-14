'use client';

import { useLayoutEffect, useState } from 'react';

interface ChatViewport {
  height: number;
  offsetTop: number;
}

/** Keeps the mobile chat inside the area left visible by the software keyboard. */
export function useChatViewport(): ChatViewport | null {
  const [viewport, setViewport] = useState<ChatViewport | null>(null);

  useLayoutEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const update = () => {
      if (window.innerWidth >= 768) {
        setViewport(null);
        return;
      }
      // Keep the existing layout while a pinch gesture zooms and pans the page.
      if (Math.abs(visualViewport.scale - 1) > 0.01) return;

      const height = visualViewport.height;
      const offsetTop = Math.max(0, visualViewport.offsetTop);
      setViewport((previous) => (
        previous?.height === height && previous.offsetTop === offsetTop
          ? previous
          : { height, offsetTop }
      ));
    };

    update();
    visualViewport.addEventListener('resize', update);
    visualViewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      visualViewport.removeEventListener('resize', update);
      visualViewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return viewport;
}

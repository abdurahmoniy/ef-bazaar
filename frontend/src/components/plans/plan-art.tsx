'use client';

import { Mail } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import type { PlanCode } from '@/lib/plans';

import styles from './plans.module.css';

const ART = {
  PRO: { file: 'pocket-watch', label: 'Oltin cho‘ntak soati' },
  MAX: { file: 'top-hat', label: 'Qora va oltin shlyapa' },
} as const;

/** Decorative motion follows mouse hover; touch and reduced motion keep the still. */
export function PlanArt({ code }: { code: PlanCode }) {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const art = code === 'PRO' || code === 'MAX' ? ART[code] : null;

  useEffect(() => {
    const player = video.current;
    const target = container.current?.closest('article') ?? container.current;
    if (!player || !target || !art) return;

    const media = player;
    const source = `/plans/${art.file}.mp4`;
    const preference = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    );
    let attempt = 0;
    let failed = false;
    let disposed = false;

    function stop() {
      attempt += 1;
      if (media.getAttribute('src')) media.pause();
      setPlaying(false);
    }

    async function start(event: Event) {
      if ((event as PointerEvent).pointerType !== 'mouse'
          || !preference.matches || document.hidden || failed) return;
      const current = ++attempt;
      if (!media.getAttribute('src')) media.src = source;
      media.currentTime = 0;
      try {
        await media.play();
        if (!disposed && current === attempt) setPlaying(true);
      } catch {
        if (!disposed && current === attempt) {
          failed = true;
          setPlaying(false);
        }
      }
    }

    const enter = (event: Event) => { void start(event); };
    const changed = () => { if (!preference.matches) stop(); };
    const hidden = () => { if (document.hidden) stop(); };
    const error = () => { failed = true; stop(); };
    target.addEventListener('pointerenter', enter);
    target.addEventListener('pointerleave', stop);
    media.addEventListener('ended', stop);
    media.addEventListener('error', error);
    preference.addEventListener('change', changed);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      disposed = true;
      attempt += 1;
      if (media.getAttribute('src')) media.pause();
      target.removeEventListener('pointerenter', enter);
      target.removeEventListener('pointerleave', stop);
      media.removeEventListener('ended', stop);
      media.removeEventListener('error', error);
      preference.removeEventListener('change', changed);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [art]);

  return (
    <div ref={container} className={`${styles.art} ${!art ? styles.freeArt : ''}`}>
      {art ? (
        <>
          <Image
            src={`/plans/${art.file}.webp`}
            alt={art.label}
            width={720}
            height={720}
            loading="eager"
            className={styles.artImage}
            sizes="(max-width: 639px) 340px, (max-width: 1023px) 45vw, 340px"
          />
          <video
            ref={video}
            muted
            playsInline
            preload="none"
            aria-hidden="true"
            className={`${styles.artVideo} ${playing && loaded ? styles.videoVisible : ''}`}
            onLoadedData={() => setLoaded(true)}
          />
        </>
      ) : (
        <div className={styles.envelopeScene} aria-hidden="true">
          <span className={styles.orbit} />
          <span className={styles.orbitInner} />
          <div className={styles.envelopeBack} />
          <div className={styles.envelope}><Mail strokeWidth={1} /></div>
          <span className={styles.envelopeSeal}>ef</span>
        </div>
      )}
    </div>
  );
}

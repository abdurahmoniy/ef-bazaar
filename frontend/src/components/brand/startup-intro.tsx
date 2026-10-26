'use client';

import { useEffect, useRef } from 'react';

import { BrandMark } from './brand-mark';
import styles from './startup-intro.module.css';

function dismiss() {
  delete document.documentElement.dataset.startupIntro;
}

export function StartupIntro() {
  const intro = useRef<HTMLDivElement>(null);
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (skipTimer.current !== null) clearTimeout(skipTimer.current);
    skipTimer.current = null;
  }, []);

  useEffect(() => {
    if (document.documentElement.dataset.startupIntro !== 'playing') return;

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreferenceChange = () => { if (preference.matches) dismiss(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    // This is decorative, not a modal: never hide a keyboard user's destination.
    const onFocus = () => {
      const target = document.activeElement;
      if (target && target !== document.body && target !== document.documentElement && !intro.current?.contains(target)) dismiss();
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) dismiss(); };

    onPreferenceChange();
    // Autofocus or keyboard input may have moved focus before hydration.
    onFocus();
    preference.addEventListener('change', onPreferenceChange);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocus);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      preference.removeEventListener('change', onPreferenceChange);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  return (
    <div
      ref={intro}
      className={styles.intro}
      aria-hidden="true"
      onClick={(event) => {
        event.stopPropagation();
        if (skipTimer.current !== null) return;
        skipTimer.current = setTimeout(dismiss, 500);
      }}
      onAnimationEnd={(event) => { if (event.target === event.currentTarget) dismiss(); }}
    >
      <div className={styles.geometry} aria-hidden="true">
        <div className={styles.bluePlane} />
        <div className={styles.topRibbon} />
        <div className={styles.bottomRibbon} />
        <div className={styles.outline} />
      </div>

      <div className={styles.identity} aria-hidden="true">
        <div className={styles.emblem}>
          <div className={styles.topSlice}><BrandMark className={styles.glyph} /></div>
          <div className={styles.middleSlice}><BrandMark className={styles.glyph} /></div>
          <div className={styles.bottomSlice}><BrandMark className={styles.glyph} /></div>
        </div>
        <div className={styles.wordmark}>eF<span>Bazaar</span></div>
        <div className={styles.caption}>eFootball akkauntlar bozori</div>
        <div className={styles.accent} />
      </div>
    </div>
  );
}

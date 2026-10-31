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
      id="startup-intro"
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
      <audio src="/sounds/startup.m4a" preload="none" hidden />
      <svg className={styles.geometry} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" fill="currentColor" aria-hidden="true">
        <g className={styles.fieldLeft}>
          <path d="M-180 78H430a18 18 0 0 1 0 36H-180Z M-80 174H600v10H-80Z M25 240H410v38H25Z M-160 550H610v40H-160Z M-100 690H480v12H-100Z" />
          <path d="M285 110h58l145 145h-58Z M180 590h72L65 777H-7Z M460 278h56l150 150h-56Z M-50 440h250v14H-50Z" />
        </g>
        <g className={styles.fieldRight}>
          <path d="M710 150h570v44H710a22 22 0 0 1 0-44Z M630 270h630v12H630Z M590 510h710v38H590a19 19 0 0 1 0-38Z M780 640h470v18H780Z M470 730h790v30H470Z" />
          <path d="M760 194h60l145 145h-60Z M960 555h70L815 770h-70Z M970-40h70L855 145h-70Z M490 20h420v10H490Z" />
        </g>
        <g className={styles.fieldDiagonal}>
          <path d="M410-100h92L1150 548h-92Z M-100 350h84l380 380h-84Z M1050 0h44L770 324h-44Z M640 600h90L530 800h-90Z" />
        </g>
        <g className={styles.ribbon}>
          <path d="M-300 352H850a48 48 0 0 1 0 96H-300Z" />
        </g>
      </svg>

      <div className={styles.identity} aria-hidden="true">
        <div className={styles.emblem}>
          <div className={styles.rotor}>
            <div className={styles.topSlice}><BrandMark className={styles.glyph} /></div>
            <div className={styles.middleSlice}><BrandMark className={styles.glyph} /></div>
            <div className={styles.bottomSlice}><BrandMark className={styles.glyph} /></div>
          </div>
        </div>
        <div className={styles.signature}>
          <div className={styles.wordmark}>eF<span>Bazaar</span></div>
          <div className={styles.caption}>eFootball akkauntlar bozori</div>
          <div className={styles.accent} />
        </div>
      </div>
    </div>
  );
}

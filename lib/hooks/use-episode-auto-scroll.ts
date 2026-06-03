'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

const USER_SCROLL_GRACE_MS = 1200;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Auto-scrolls the container so the element marked with `data-episode-active="true"`
 * is visible. Skips the auto-scroll when the user has scrolled recently so
 * the browser doesn't yank the viewport out from under them. Re-checks on
 * every change of the supplied `activeKey` and on container size changes.
 */
export function useEpisodeAutoScroll(
  containerRef: RefObject<HTMLElement | null>,
  activeKey: string,
  deps: ReadonlyArray<unknown> = [],
): void {
  const userScrolledAtRef = useRef(0);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const markUserScroll = () => {
      userScrolledAtRef.current = Date.now();
    };
    node.addEventListener('pointerdown', markUserScroll, { passive: true });
    node.addEventListener('wheel', markUserScroll, { passive: true });
    node.addEventListener('keydown', markUserScroll);
    node.addEventListener('touchstart', markUserScroll, { passive: true });
    return () => {
      node.removeEventListener('pointerdown', markUserScroll);
      node.removeEventListener('wheel', markUserScroll);
      node.removeEventListener('keydown', markUserScroll);
      node.removeEventListener('touchstart', markUserScroll);
    };
  }, [containerRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = readReducedMotion();

    const tryScroll = () => {
      const active = container.querySelector<HTMLElement>('[data-episode-active="true"]');
      if (!active) return;
      if (Date.now() - userScrolledAtRef.current < USER_SCROLL_GRACE_MS) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const fullyVisible =
        activeRect.top >= containerRect.top && activeRect.bottom <= containerRect.bottom;
      if (fullyVisible) {
        return;
      }
      active.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
        inline: 'nearest',
      });
    };

    if (lastKeyRef.current === activeKey) {
      // No active change — still respect container resize so newly-resized
      // panes re-evaluate visibility, but don't re-fire on every render.
    } else {
      lastKeyRef.current = activeKey;
    }

    // Defer one frame so the new active class is reflected in the DOM.
    const raf = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, ...deps]);
}

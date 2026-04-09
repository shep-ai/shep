/**
 * useResolvedTheme
 *
 * Reactively reports whether `<html>` currently has the `dark` class,
 * matching the existing `useTheme` hook's `resolvedTheme` without
 * duplicating its localStorage/system-preference state machine.
 *
 * Uses a MutationObserver so it updates instantly when the user
 * toggles themes anywhere in the app (via `ThemeToggle`, system
 * preference change, etc.).
 */

'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

export type ResolvedTheme = 'light' | 'dark';

function readTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

// Prefer `useLayoutEffect` on the client so the observed theme is applied
// before paint — avoids a one-frame flash of the wrong background after
// initial mount. On the server (where `useLayoutEffect` warns and no-ops)
// fall back to `useEffect`.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useResolvedTheme(): ResolvedTheme {
  // Default to `'light'` (matching the app's CSS default) so SSR / the very
  // first client render don't paint a dark fallback in a light app.
  const [theme, setTheme] = useState<ResolvedTheme>('light');

  useIsoLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => setTheme(readTheme());
    update();

    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

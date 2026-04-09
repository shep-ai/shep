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

import { useEffect, useState } from 'react';

export type ResolvedTheme = 'light' | 'dark';

function readTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(() => readTheme());

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setTheme(readTheme());
    update();

    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

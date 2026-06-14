import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'husk-theme';

/** The theme currently applied to <html> (set by the inline script in index.html). */
function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
}

/**
 * Read/toggle the light/dark theme. Defaults to the system preference and keeps
 * following it live until the user makes an explicit choice (then that sticks).
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    setTheme(currentTheme());

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e: MediaQueryListEvent) => {
      // Only follow the system while the user has not picked a theme explicitly.
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      if (saved) return;
      const next: Theme = e.matches ? 'dark' : 'light';
      apply(next);
      setTheme(next);
    };

    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore - storage may be unavailable (private mode, etc.)
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}

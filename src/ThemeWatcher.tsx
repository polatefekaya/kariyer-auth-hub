import { onMount, onCleanup, createEffect } from 'solid-js';
import {
  theme,
  setTheme,
  readCookieTheme,
  writeCookieTheme,
  readStoredTheme,
  writeStoredTheme,
  THEME_STORAGE_KEY,
} from './stores/theme';

const ThemeWatcher = () => {
  // Reactively apply the class to <html> whenever the signal changes.
  createEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme());
  });

  onMount(() => {
    // --- Priority 1: shared subdomain cookie ---
    // The main frontend (kariyerzamani.com) writes kariyer_theme=dark/light with
    // domain=.kariyerzamani.com, making it readable here on auth.kariyerzamani.com.
    // This is the authoritative cross-subdomain source.
    const cookieTheme = readCookieTheme();

    if (cookieTheme) {
      // Mirror into this origin's localStorage so Turnstile & other consumers
      // that read the signal always see a consistent value.
      writeStoredTheme(cookieTheme);
      setTheme(cookieTheme);
    } else {
      // --- Priority 2: own localStorage (same-origin fallback) ---
      setTheme(readStoredTheme());
    }

    // --- Priority 3: cross-tab storage event (same-origin only) ---
    // Fires when another tab on auth.kariyerzamani.com updates localStorage.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        const next = readCookieTheme() ?? readStoredTheme();
        setTheme(next);
      }
    };

    window.addEventListener('storage', handleStorage);
    onCleanup(() => window.removeEventListener('storage', handleStorage));
  });

  return null;
};

export default ThemeWatcher;

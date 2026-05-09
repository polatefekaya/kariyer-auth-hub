import { createSignal } from 'solid-js';

export const THEME_STORAGE_KEY = 'kariyer-theme-storage';
export const THEME_COOKIE_NAME = 'kariyer_theme';
// Falls back to production domain. Override in .env.local for local testing.
const COOKIE_DOMAIN = import.meta.env.VITE_COOKIE_DOMAIN ?? '.kariyerzamani.com';

export type AppTheme = 'light' | 'dark';

export function readCookieTheme(): AppTheme | null {
  try {
    const match = document.cookie.match(
      new RegExp('(?:^|;\\s*)' + THEME_COOKIE_NAME + '=([^;]*)')
    );
    const val = match ? decodeURIComponent(match[1]) : null;
    return val === 'dark' || val === 'light' ? val : null;
  } catch {
    return null;
  }
}

export function writeCookieTheme(t: AppTheme): void {
  // max-age = 1 year; Secure omitted here — add it if you enforce HTTPS-only cookies
  document.cookie = `${THEME_COOKIE_NAME}=${t}; domain=${COOKIE_DOMAIN}; path=/; max-age=31536000; SameSite=Lax`;
}

export function readStoredTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const t = JSON.parse(raw)?.state?.theme;
      if (t === 'dark' || t === 'light') return t as AppTheme;
    }
  } catch {
    // ignore
  }
  return 'light';
}

export function writeStoredTheme(t: AppTheme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ state: { theme: t }, version: 0 }));
  } catch {
    // ignore
  }
}

// Module-level reactive signal. ThemeWatcher drives it; any component can read theme().
export const [theme, setTheme] = createSignal<AppTheme>(
  typeof localStorage !== 'undefined' ? (readCookieTheme() ?? readStoredTheme()) : 'light'
);

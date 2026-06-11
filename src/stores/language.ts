import { createSignal } from 'solid-js';

export const SUPPORTED_LANGUAGES = ['tr', 'en', 'de', 'nl', 'fr', 'it'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'tr';

export const LANGUAGE_COOKIE = 'kariyer_lang';
export const LANGUAGE_STORAGE_KEY = 'kariyer-language-storage';
const COOKIE_DOMAIN = import.meta.env.VITE_COOKIE_DOMAIN ?? '.kariyerzamani.com';

function coerceLang(value?: string | null): AppLanguage | null {
  const code = value?.split('-')[0]?.toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code ?? '') ? (code as AppLanguage) : null;
}

export function readCookieLang(): AppLanguage | null {
  try {
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + LANGUAGE_COOKIE + '=([^;]*)'));
    return coerceLang(match ? decodeURIComponent(match[1]) : null);
  } catch { return null; }
}

export function writeCookieLang(lang: AppLanguage): void {
  document.cookie = `${LANGUAGE_COOKIE}=${lang}; domain=${COOKIE_DOMAIN}; path=/; max-age=31536000; SameSite=Lax`;
}

export function readStoredLang(): AppLanguage | null {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return coerceLang(raw ? JSON.parse(raw)?.lang : null);
  } catch { return null; }
}

export function writeStoredLang(lang: AppLanguage): void {
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify({ lang })); } catch { }
}

function detectBrowserLanguage(): AppLanguage | null {
  if (typeof navigator === 'undefined') return null;
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const p of prefs) { const m = coerceLang(p); if (m) return m; }
  return null;
}

function detectInitialLanguage(): AppLanguage {
  return readCookieLang() ?? readStoredLang() ?? detectBrowserLanguage() ?? DEFAULT_LANGUAGE;
}

export const [language, setLanguageSignal] = createSignal<AppLanguage>(
  typeof document !== 'undefined' ? detectInitialLanguage() : DEFAULT_LANGUAGE
);

export function setLanguage(lang: AppLanguage): void {
  writeCookieLang(lang);
  writeStoredLang(lang);
  setLanguageSignal(lang);
}

import { language } from '../stores/language';
import { tr } from './locales/tr';
import { en } from './locales/en';
import { de } from './locales/de';
import { nl } from './locales/nl';
import { fr } from './locales/fr';
import { it } from './locales/it';

export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type AppLanguage, setLanguage } from '../stores/language';

type DeepRecord = { [key: string]: string | DeepRecord };

const locales: Record<string, DeepRecord> = { tr, en, de, nl, fr, it };

function deepGet(obj: DeepRecord, path: string): string | undefined {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Reactive translation function. Reads the `language()` signal, so any SolidJS
 * reactive context (JSX, createMemo, createEffect) that calls t() will
 * automatically re-run when the language changes.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = language();
  let value = deepGet(locales[lang] ?? {}, key) ?? deepGet(locales.tr, key) ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return value;
}

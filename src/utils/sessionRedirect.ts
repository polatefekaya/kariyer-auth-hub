import { ALLOWED_ORIGINS } from '../types/config';

const REDIRECT_KEY = "kariyer_auth_redirect";

export function isAllowedRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "kariyerzamani:") return true;
    if (ALLOWED_ORIGINS.has(parsed.origin)) return true;
    if (parsed.origin === window.location.origin) return true;
    // Allow any local development origin (localhost, 127.0.0.1, [::1]) regardless of dev server port
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const saveAuthRedirect = (url: string): boolean => {
  if (isAllowedRedirect(url)) {
    try {
      sessionStorage.setItem(REDIRECT_KEY, url);
      return true;
    } catch (e) {
      console.warn("[auth] Failed to persist redirect target to sessionStorage", e);
      return false;
    }
  }
  console.warn(`[auth] Rejected redirect_to target: origin "${(() => { try { return new URL(url).origin; } catch { return url; } })()}" is not in ALLOWED_ORIGINS`, url);
  return false;
};

export const getAuthRedirect = (): string | null =>
  sessionStorage.getItem(REDIRECT_KEY);

export const clearAuthRedirect = (): void =>
  sessionStorage.removeItem(REDIRECT_KEY);

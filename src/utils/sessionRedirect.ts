import { ALLOWED_ORIGINS } from '../types/config';

const REDIRECT_KEY = "kariyer_auth_redirect";

function isAllowedRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "kariyerzamani:") return true;
    if (ALLOWED_ORIGINS.has(parsed.origin)) return true;
    if (parsed.origin === window.location.origin) return true;
    return false;
  } catch {
    return false;
  }
}

export const saveAuthRedirect = (url: string) => {
  if (isAllowedRedirect(url)) {
    sessionStorage.setItem(REDIRECT_KEY, url);
  }
};

export const getAuthRedirect = () =>
  sessionStorage.getItem(REDIRECT_KEY);

export const clearAuthRedirect = () =>
  sessionStorage.removeItem(REDIRECT_KEY);

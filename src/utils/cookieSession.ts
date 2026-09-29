export const SESSION_COOKIE_NAME = 'kz_sb_session';

export function getCookieDomain(): string {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host.endsWith('kariyerzamani.com')) {
    return '.kariyerzamani.com';
  }
  return '';
}

export function writeSessionCookie(session: { access_token: string; refresh_token: string }): void {
  try {
    const domain = getCookieDomain();
    const domainAttr = domain ? `; domain=${domain}` : '';
    const secureAttr = window.location.protocol === 'https:' ? '; Secure' : '';
    const payload = encodeURIComponent(JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }));
    document.cookie = `${SESSION_COOKIE_NAME}=${payload}${domainAttr}; path=/; max-age=604800; SameSite=Lax${secureAttr}`;
  } catch (err) {
    console.warn('[auth] Failed to write session cookie', err);
  }
}

export function clearSessionCookie(): void {
  try {
    const domain = getCookieDomain();
    const domainAttr = domain ? `; domain=${domain}` : '';
    document.cookie = `${SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT${domainAttr}; path=/; SameSite=Lax`;
  } catch (err) {
    console.warn('[auth] Failed to clear session cookie', err);
  }
}

import { getAuthRedirect } from './sessionRedirect';

/**
 * Classify where an auth flow originated, derived from the saved `redirect_to`
 * target (falling back to the current URL's `redirect_to` query param).
 *
 * This makes the cross-app "apply-on-register" journey observable: when an
 * anonymous user taps Apply on a job in the web app, they are sent here to
 * register (or log in) with a `redirect_to` pointing back at the job listing.
 * Tagging the auth funnel with that origin lets analytics connect the
 * registration to the deferred job application completed back in the web app.
 *
 * Returns OTel/PostHog-friendly string attributes. Never throws — telemetry
 * must not break the auth flow.
 */
export function authOriginAttributes(): Record<string, string> {
  let target: string | null = null;
  try {
    target = getAuthRedirect();
    if (!target && typeof window !== 'undefined') {
      target = new URLSearchParams(window.location.search).get('redirect_to');
    }
  } catch {
    /* sessionStorage / URL parsing unavailable */
  }

  if (!target) return {};

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : undefined;
    const url = new URL(target, base);
    // The web app serves job listings/details under /ilanlar (… /ilan*).
    const fromJobApply = /\/ilan/i.test(url.pathname);
    const attrs: Record<string, string> = {
      'auth_origin.host': url.host,
      'auth_origin.from_job_apply': String(fromJobApply),
    };
    if (fromJobApply) attrs['auth_origin.kind'] = 'job_apply';
    return attrs;
  } catch {
    return {};
  }
}

import { getAuthRedirect } from './sessionRedirect';

/**
 * Google Tag Manager `dataLayer` events for the marketing-side registration
 * funnel (Novexing measurement spec, 16 Sep 2026). The GTM container is loaded
 * in index.html — same container as the main site.
 *
 * Event and parameter names are a CONTRACT with the ad/measurement accounts —
 * do not rename them. Consent gating happens inside GTM, so the push itself is
 * unconditional. No personal data (name, email, phone, uid) may be included.
 *
 * Separate from PostHog/OTel (`authFunnel`, `posthog-events`): those are
 * product/engineering telemetry; this feeds GA4 / Google Ads / Meta via GTM.
 */

type GtmParams = Record<string, string | number | boolean>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function pushGtmEvent(event: string, params: GtmParams = {}): void {
  try {
    if (typeof window === 'undefined') return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...params });
  } catch {
    // Analytics must never break the auth flow.
  }
}

export type RegistrationSourcePage = 'job' | 'home' | 'other';

interface RegistrationContext {
  source_page: RegistrationSourcePage;
  /** Job uid when the user came from a listing; absent otherwise (spec: omit, don't send empty). */
  job_id?: string;
}

/**
 * Where the user came from, derived from the saved `redirect_to` (the web app
 * sends users here with the page they were on). Mirrors `authOriginAttributes`
 * but in the marketing spec's vocabulary:
 *   job   — a listing page (/ilanlar…, /is-ilanlari/ilan/…), or an apply intent (?kz_apply=)
 *   home  — the landing page
 *   other — anything else, or no redirect at all
 */
export function registrationContext(): RegistrationContext {
  let target: string | null = null;
  try {
    target = getAuthRedirect();
    if (!target && typeof window !== 'undefined') {
      target = new URLSearchParams(window.location.search).get('redirect_to');
    }
  } catch {
    /* sessionStorage / URL parsing unavailable */
  }
  if (!target) return { source_page: 'other' };

  try {
    const url = new URL(target, window.location.origin);
    // The deferred apply-on-register intent carries the job uid explicitly.
    const jobId = url.searchParams.get('kz_apply');
    if (jobId) return { source_page: 'job', job_id: jobId };
    if (/\/ilan/i.test(url.pathname)) return { source_page: 'job' };
    if (url.pathname === '/' || url.pathname === '') return { source_page: 'home' };
    return { source_page: 'other' };
  } catch {
    return { source_page: 'other' };
  }
}

const FORM_VIEW_KEY = 'kz_gtm_registration_form_view';

/**
 * The registration form was shown. Once per visit (sessionStorage), so a
 * re-render / back-navigation to the form doesn't fire again (spec).
 */
export function gtmRegistrationFormView(): void {
  try {
    if (sessionStorage.getItem(FORM_VIEW_KEY)) return;
    sessionStorage.setItem(FORM_VIEW_KEY, '1');
  } catch {
    /* no sessionStorage — fire anyway rather than lose the event */
  }
  pushGtmEvent('registration_form_view', toParams(registrationContext(), true));
}

/**
 * The account was created — server confirmed. Never on the click, never on a
 * failed attempt. `method` is lowercase: email | google | apple.
 * Pass a pre-captured `ctx` when the saved redirect is about to be overwritten.
 */
export function gtmSignUp(method: string, ctx: RegistrationContext = registrationContext()): void {
  pushGtmEvent('sign_up', { method: method.toLowerCase(), ...toParams(ctx, false) });
}

/** `job_id` is only present when there is one (spec: omit the key entirely otherwise). */
function toParams(ctx: RegistrationContext, includeSource: boolean): GtmParams {
  const params: GtmParams = {};
  if (includeSource) params.source_page = ctx.source_page;
  if (ctx.job_id) params.job_id = ctx.job_id;
  return params;
}

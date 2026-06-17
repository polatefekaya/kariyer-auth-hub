import posthog from 'posthog-js';
import type { PostHog } from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || '';
const IS_DEV = import.meta.env.DEV;

let _instance: PostHog | null = null;

if (POSTHOG_KEY && POSTHOG_HOST) {
  try {
    // Adopt the web app's distinct_id (passed as ?kz_did=) so the cross-domain anonymous
    // journey — job link on the web app → register here — is ONE PostHog person from the
    // very first event, even for visitors who never finish registering. Read before init.
    let incomingDid: string | null = null;
    try {
      incomingDid = new URLSearchParams(window.location.search).get('kz_did');
    } catch { /* URL unavailable */ }

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: true,
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
      // 'always' so anonymous drop-offs (people who bounce on register) materialize as
      // persons — that is the cohort we need to see. Flip to 'identified_only' to cut volume.
      person_profiles: 'always',
      // Prod: web + auth-hub share kariyerzamani.com, so the anon cookie can also carry over.
      // Dev runs on different localhost origins (no shared cookie) — kz_did is the real stitch.
      cross_subdomain_cookie: !IS_DEV,
      debug: IS_DEV,
      disable_session_recording: true, // auth hub handles passwords — no replay
      ...(incomingDid ? { bootstrap: { distinctID: incomingDid, isIdentifiedID: false } } : {}),
      loaded: (ph) => {
        try {
          const otelSessionId = sessionStorage.getItem('otel_session_id');
          if (otelSessionId) {
            ph.register({ otel_session_id: otelSessionId });
          }
        } catch {}
      },
    });

    _instance = posthog;
  } catch {
    // PostHog init failed — app continues without analytics
  }
}

export function getPostHog(): PostHog | null {
  return _instance;
}

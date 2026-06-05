import posthog from 'posthog-js';
import type { PostHog } from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || '';
const IS_DEV = import.meta.env.DEV;

let _instance: PostHog | null = null;

if (POSTHOG_KEY && POSTHOG_HOST) {
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: true,
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
      person_profiles: 'identified_only',
      debug: IS_DEV,
      disable_session_recording: true, // auth hub handles passwords — no replay
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

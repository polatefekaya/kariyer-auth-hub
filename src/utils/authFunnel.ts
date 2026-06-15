import { trace, SpanStatusCode } from '@opentelemetry/api';
import { metrics } from '@opentelemetry/api';
import { captureAuthEvent } from './posthog-events';
import { authOriginAttributes } from './authOrigin';

const tracer = trace.getTracer('auth-hub');
const meter = metrics.getMeter('auth-hub');

const funnelStepCounter = meter.createCounter('auth_funnel.step', {
  description: 'Auth funnel step completion count',
});

const funnelDropoffCounter = meter.createCounter('auth_funnel.dropoff', {
  description: 'Auth funnel dropoff count',
});

const funnelDurationHistogram = meter.createHistogram('auth_funnel.duration_ms', {
  description: 'Time between auth funnel steps',
  unit: 'ms',
});

interface FunnelState {
  funnel: string;
  step: string;
  timestamp: number;
  startTimestamp: number;
  email?: string;
  accountType?: string;
}

const STORAGE_KEY = 'otel_auth_funnel';

function loadState(): FunnelState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState(state: FunnelState): void {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function clearState(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

/**
 * Track an auth funnel step. Creates an OTel span + metric.
 *
 * Funnels:
 *   registration: select_type → fill_form → submit → verify_email → email_verified → redirect
 *   login:        fill_form → submit → redirect
 *   login:        fill_form → submit → legacy_check → redirect_migrate
 *   password_reset: request → open_link → set_password → redirect
 *   migration:    select_account → set_password → submit → verify_email → redirect
 *   oauth:        click_provider → callback → redirect
 */
export function trackAuthStep(
  funnel: string,
  step: string,
  attrs?: Record<string, string>,
): void {
  const now = performance.now();
  const prev = loadState();

  // Apply-origin context (e.g. registration started from a job apply). Added to
  // the span + PostHog event, but NOT to the metric labels below (low cardinality).
  const originAttrs = authOriginAttributes();

  const attributes: Record<string, string> = {
    'auth_funnel.name': funnel,
    'auth_funnel.step': step,
    ...originAttrs,
    ...attrs,
  };

  if (prev && prev.funnel === funnel) {
    funnelDurationHistogram.record(now - prev.timestamp, {
      'auth_funnel.name': funnel,
      'auth_funnel.from_step': prev.step,
      'auth_funnel.to_step': step,
    });
  }

  funnelStepCounter.add(1, {
    'auth_funnel.name': funnel,
    'auth_funnel.step': step,
    ...attrs,
  });

  const span = tracer.startSpan(`auth.${funnel}.${step}`, { attributes });
  // Save traceparent BEFORE ending span — getActiveSpan returns null after end()
  try {
    const ctx = span.spanContext();
    sessionStorage.setItem('otel_auth_traceparent', `00-${ctx.traceId}-${ctx.spanId}-01`);
  } catch {}
  span.end();
  captureAuthEvent(`auth/${step}`, { funnel, ...originAttrs, ...attrs });

  saveState({
    funnel,
    step,
    timestamp: now,
    startTimestamp: prev?.startTimestamp ?? now,
    email: attrs?.email ?? prev?.email,
    accountType: attrs?.account_type ?? prev?.accountType,
  });
}

/**
 * Track auth funnel completion (successful redirect to main app).
 */
export function completeAuthFunnel(funnel: string, attrs?: Record<string, string>): void {
  const prev = loadState();
  const originAttrs = authOriginAttributes();

  const span = tracer.startSpan(`auth.${funnel}.complete`, {
    attributes: {
      'auth_funnel.name': funnel,
      'auth_funnel.step': 'complete',
      'auth_funnel.total_duration_ms': prev
        ? String(Math.round(performance.now() - prev.startTimestamp))
        : 'unknown',
      ...originAttrs,
      ...attrs,
    },
  });
  span.end();
  captureAuthEvent(`auth/${funnel}_complete`, { ...originAttrs, ...attrs });

  // Persist traceparent for the redirect
  try {
    const ctx = span.spanContext();
    sessionStorage.setItem('otel_auth_traceparent', `00-${ctx.traceId}-${ctx.spanId}-01`);
  } catch {}

  clearState();
}

/**
 * Track auth funnel dropoff (user abandoned the flow).
 */
export function trackAuthDropoff(funnel: string, lastStep: string, reason?: string): void {
  funnelDropoffCounter.add(1, {
    'auth_funnel.name': funnel,
    'auth_funnel.last_step': lastStep,
    'auth_funnel.dropoff_reason': reason ?? 'unknown',
  });

  const span = tracer.startSpan(`auth.${funnel}.dropoff`, {
    attributes: {
      'auth_funnel.name': funnel,
      'auth_funnel.last_step': lastStep,
      'auth_funnel.dropoff_reason': reason ?? 'unknown',
    },
  });
  span.setStatus({ code: SpanStatusCode.ERROR, message: `Dropoff at ${lastStep}` });
  span.end();

  clearState();
}

/**
 * Track an auth error (failed login, invalid email, etc.)
 */
export function trackAuthError(
  funnel: string,
  step: string,
  error: string,
  attrs?: Record<string, string>,
): void {
  const span = tracer.startSpan(`auth.${funnel}.error`, {
    attributes: {
      'auth_funnel.name': funnel,
      'auth_funnel.step': step,
      'auth_funnel.error': error,
      ...attrs,
    },
  });
  span.setStatus({ code: SpanStatusCode.ERROR, message: error });
  span.end();
  captureAuthEvent(`auth/${funnel}_error`, { step, error, ...attrs });
}

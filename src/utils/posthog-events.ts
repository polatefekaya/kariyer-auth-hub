import { trace } from '@opentelemetry/api';

export function captureAuthEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  try {
    const { getPostHog } = require('../posthog');
    const ph = getPostHog();
    if (!ph) return;

    const otelProps: Record<string, string> = {};

    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const ctx = activeSpan.spanContext();
      otelProps.otel_trace_id = ctx.traceId;
      otelProps.otel_span_id = ctx.spanId;
    }

    const otelSessionId = sessionStorage.getItem('otel_session_id');
    if (otelSessionId) otelProps.otel_session_id = otelSessionId;

    ph.capture(eventName, { ...properties, ...otelProps });
  } catch {}
}

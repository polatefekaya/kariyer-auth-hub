import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor, AlwaysOnSampler, TraceIdRatioBasedSampler, ParentBasedSampler } from '@opentelemetry/sdk-trace-base';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { Span as SdkSpan } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { Context } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { StackContextManager } from '@opentelemetry/sdk-trace-web';
import { CompositePropagator, W3CTraceContextPropagator, W3CBaggagePropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { LongTaskInstrumentation } from '@opentelemetry/instrumentation-long-task';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { logs } from '@opentelemetry/api-logs';
import type { Logger } from '@opentelemetry/api-logs';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { metrics } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const OTLP_BASE = import.meta.env.VITE_OTLP_BASE || 'https://your-gateway.com';
const IS_DEV = import.meta.env.DEV;
const SAMPLE_RATE = parseFloat(import.meta.env.VITE_TRACE_SAMPLE_RATE || '0.1');

let _sessionId: string | null = sessionStorage.getItem('otel_session_id');
if (!_sessionId) {
  _sessionId = crypto.randomUUID();
  sessionStorage.setItem('otel_session_id', _sessionId);
}

export const getSessionId = (): string => _sessionId!;

export let otelLogger: Logger | null = null;

export const _origConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

export function emitLog(
  severityText: string,
  body: string,
  attributes?: Record<string, string>,
): void {
  try {
    otelLogger?.emit({ severityText, body, attributes });
  } catch {}
}

export function getCurrentTraceparent(): string | null {
  try {
    const span = trace.getActiveSpan();
    if (!span) return null;
    const ctx = span.spanContext();
    return `00-${ctx.traceId}-${ctx.spanId}-01`;
  } catch {
    return null;
  }
}

export function injectTraceparent(url: string): string {
  try {
    const traceparent = sessionStorage.getItem('otel_auth_traceparent');
    if (!traceparent) return url;
    const u = new URL(url);
    u.searchParams.set('traceparent', traceparent);
    return u.toString();
  } catch {
    return url;
  }
}

function _safeStr(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ''}`;
  try { return JSON.stringify(a); } catch { return String(a); }
}
const _stringify = (args: unknown[]): string => args.map(_safeStr).join(' ');

try {
  const resource = resourceFromAttributes({
    'service.name': 'auth-hub',
    'service.version': import.meta.env.VITE_VERSION || '0.1.0',
    'service.instance.id': _sessionId!,
    'deployment.environment': import.meta.env.VITE_ENVIRONMENT || (import.meta.env.DEV ? 'development' : 'production'),
  });

  // ─── Logs Provider ──────────────────────────────────────────────────────────
  const logsExporter = new OTLPLogExporter({ url: `${OTLP_BASE}/v1/logs` });
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(logsExporter)],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
  otelLogger = logs.getLogger('auth-hub');

  // ─── Metrics Provider ───────────────────────────────────────────────────────
  const metricsExporter = new OTLPMetricExporter({ url: `${OTLP_BASE}/v1/metrics` });
  const meterProvider = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: metricsExporter })],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  // ─── Sampling ──────────────────────────────────────────────────────────────
  const sampler = new ParentBasedSampler({
    root: IS_DEV ? new AlwaysOnSampler() : new TraceIdRatioBasedSampler(SAMPLE_RATE),
  });

  // ─── SessionAttributeSpanProcessor ──────────────────────────────────────────
  class SessionAttributeSpanProcessor implements SpanProcessor {
    onStart(span: SdkSpan, _parentContext: Context): void {
      try {
        span.setAttribute('session.id', _sessionId!);
        const url = new URL(window.location.href);
        const accountType = url.searchParams.get('type') || 'unknown';
        span.setAttribute('auth.account_type', accountType);
      } catch {}
    }
    onEnd(_span: ReadableSpan): void {}
    shutdown(): Promise<void> { return Promise.resolve(); }
    forceFlush(): Promise<void> { return Promise.resolve(); }
  }

  // ─── Trace Provider ─────────────────────────────────────────────────────────
  // Uses StackContextManager instead of ZoneContextManager — zone.js is not
  // needed for Solid.js and its static import crashes Vite's build (zone.js
  // patches browser globals like CustomEvent/EventTarget in Node.js context).
  const traceExporter = new OTLPTraceExporter({ url: `${OTLP_BASE}/v1/traces` });
  const provider = new WebTracerProvider({
    resource,
    sampler,
    spanProcessors: [
      new SessionAttributeSpanProcessor(),
      new BatchSpanProcessor(traceExporter),
    ],
  });

  provider.register({
    contextManager: new StackContextManager(),
    propagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  });

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [/your-gateway\.com/, /kariyerzamani\.com/],
      }),
      new XMLHttpRequestInstrumentation(),
      new DocumentLoadInstrumentation(),
      new UserInteractionInstrumentation(),
      new LongTaskInstrumentation(),
    ],
  });

  // ─── Console Interceptor ─────────────────────────────────────────────────────
  const _otel = otelLogger;
  (['log', 'warn', 'error', 'info', 'debug'] as const).forEach((level) => {
    console[level] = (...args: unknown[]) => {
      _origConsole[level](...args as [unknown, ...unknown[]]);
      try {
        _otel?.emit({ severityText: level.toUpperCase(), body: _stringify(args) });
      } catch {}
    };
  });

  // ─── Global Error Handlers ───────────────────────────────────────────────────
  window.onerror = (msg, src, line, _col, err) => {
    try {
      otelLogger?.emit({
        severityText: 'ERROR',
        body: String(msg),
        attributes: {
          'error.source': String(src ?? ''),
          'error.line': String(line ?? ''),
          'error.stack': err?.stack ?? '',
          'error.type': 'uncaught_exception',
        },
      });
    } catch {}
  };

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    try {
      otelLogger?.emit({
        severityText: 'ERROR',
        body: String(e.reason),
        attributes: { 'error.type': 'unhandledrejection' },
      });
    } catch {}
  });

} catch (initError) {
  _origConsole.warn('[OTel] Initialization failed:', initError);
}

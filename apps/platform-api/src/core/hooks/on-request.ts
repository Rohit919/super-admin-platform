import type { FastifyInstance } from "fastify";
import { trace } from "@opentelemetry/api";

/**
 * onRequest hook — correlates traces with logs.
 *
 * When OpenTelemetry is active there is a current span for the request; we copy
 * its traceId/spanId onto the request's child logger so every log line can be
 * pivoted to the matching trace in Jaeger/Tempo. When tracing is disabled there
 * is no active span and this is a cheap no-op.
 */
export function registerOnRequestHook(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    const span = trace.getActiveSpan();
    if (span) {
      const ctx = span.spanContext();
      request.log = request.log.child({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
      });
    }
  });
}

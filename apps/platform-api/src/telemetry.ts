/**
 * OpenTelemetry bootstrap — MUST be imported before anything else in server.ts
 * so it can patch Node core modules (http, etc.) as they load.
 *
 * Opt-in: only starts the SDK when OTEL_ENABLED=true. This keeps the dev loop
 * and tests free of tracing overhead and avoids failed exports when no
 * collector is running.
 *
 * Reads directly from process.env (not fastify.config) because it runs before
 * the Fastify app — and therefore before @fastify/env — is built.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import prismaInstrumentation from "@prisma/instrumentation";

const { PrismaInstrumentation } = prismaInstrumentation;
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;

function startTelemetry(): void {
  if (process.env.OTEL_ENABLED !== "true") return;

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    "http://localhost:4318/v1/traces";

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "platform-api",
      [ATTR_SERVICE_VERSION]: process.env.COMMIT_SHA ?? "unknown",
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [
      new HttpInstrumentation(),
      new FastifyInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();

  console.log(
    `[telemetry] OpenTelemetry started — exporting traces to ${endpoint}`,
  );
}

export async function stopTelemetry(): Promise<void> {
  if (sdk) await sdk.shutdown();
}

// Start on import (side-effect) so instrumentation is registered before any
// other module — including http/fastify/prisma — is loaded by server.ts.
startTelemetry();

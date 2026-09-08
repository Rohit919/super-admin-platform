/**
 * Secrets loader — the single place that fetches secrets from an external
 * provider and merges them into process.env BEFORE the app (and @fastify/env)
 * is built.
 *
 * SECRETS_PROVIDER selects the source:
 *   env     (default) — use process.env / .env as-is (dev/test)
 *   aws     — AWS Secrets Manager
 *   vault   — HashiCorp Vault
 *   doppler — Doppler
 *
 * The cloud providers are stubs here — wire the SDK when credentials exist.
 * On any fetch failure the process exits 1 (never start misconfigured).
 * Secret values are never logged.
 */

type Provider = "env" | "aws" | "vault" | "doppler";

const SECRET_KEYS = [
  "JWT_SECRET",
  "DATABASE_URL",
  "DATABASE_DIRECT_URL",
  "REDIS_URL",
  "METRICS_TOKEN",
];

/** Redact known secret keys from any object before it could be logged. */
export function redactSecrets(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...obj };
  for (const k of SECRET_KEYS) {
    if (k in out) out[k] = "***";
  }
  return out;
}

async function loadFromAws(): Promise<Record<string, string>> {
  // Stub: replace with @aws-sdk/client-secrets-manager GetSecretValue.
  throw new Error(
    "SECRETS_PROVIDER=aws is not configured yet (add the AWS SDK integration).",
  );
}

async function loadFromVault(): Promise<Record<string, string>> {
  throw new Error("SECRETS_PROVIDER=vault is not configured yet.");
}

async function loadFromDoppler(): Promise<Record<string, string>> {
  // Doppler typically injects env via `doppler run --`; nothing to fetch here.
  return {};
}

export async function loadSecrets(): Promise<void> {
  const provider = (process.env.SECRETS_PROVIDER ?? "env") as Provider;

  try {
    let fetched: Record<string, string> = {};
    switch (provider) {
      case "env":
        return; // process.env is already populated (dotenv / real env)
      case "aws":
        fetched = await loadFromAws();
        break;
      case "vault":
        fetched = await loadFromVault();
        break;
      case "doppler":
        fetched = await loadFromDoppler();
        break;
      default:
        throw new Error(`Unknown SECRETS_PROVIDER: ${provider}`);
    }

    // Merge — real secrets override anything present in the environment.
    for (const [key, value] of Object.entries(fetched)) {
      process.env[key] = value;
    }
    // Log the KEYS loaded, never the values.

    console.log(
      `[secrets] Loaded ${Object.keys(fetched).length} secrets from ${provider}`,
    );
  } catch (err) {
    console.error(
      `[secrets] Failed to load secrets from ${provider}:`,
      (err as Error).message,
    );
    process.exit(1);
  }
}

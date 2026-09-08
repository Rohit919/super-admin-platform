import { createLogger } from "@core/utils/logger.js";

const log = createLogger("mailer");

/**
 * Email delivery seam.
 *
 * This is intentionally a thin abstraction so a real provider (SendGrid,
 * SES, Postmark, ...) can be dropped in behind `sendEmail` without touching
 * the auth flows. In development / when no provider is configured, emails are
 * logged instead of sent so local OTP flows are testable without SMTP.
 *
 * SECURITY: never log the OTP code at info level in production. The dev-only
 * console output below is guarded by NODE_ENV.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";

  // No real provider wired yet. In non-production, surface the body so
  // developers can complete OTP flows locally. In production, log only
  // metadata (never the body, which may contain a code).
  if (isProd) {
    log.info({ to: message.to, subject: message.subject }, "email.dispatch");
    // TODO: integrate a real transactional email provider here.
    return;
  }

  log.info(
    { to: message.to, subject: message.subject, body: message.text },
    "email.dispatch (dev — not actually sent)",
  );
}

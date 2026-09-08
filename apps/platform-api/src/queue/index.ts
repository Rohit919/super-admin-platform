import type { JobsOptions } from "bullmq";

/** Canonical queue names — shared by producers (API) and consumers (workers). */
export const QUEUE_NAMES = {
  NOTIFICATIONS: "notifications",
} as const;

/**
 * Default job options: 3 attempts with exponential backoff (~1s, 5s, 25s).
 * Completed jobs are trimmed; failed jobs are kept for dead-letter inspection.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: false,
};

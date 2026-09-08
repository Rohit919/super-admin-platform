/**
 * Date / duration utilities.
 */

/**
 * Parse a duration string like "7d", "15m", "1h", "30s" into milliseconds.
 * Used for JWT expiry and refresh token TTL parsing.
 */
export function parseDurationMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Expected e.g. "7d", "15m", "1h", "30s".`,
    );
  }
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[unit]!;
}

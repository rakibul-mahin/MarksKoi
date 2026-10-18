import "server-only";
import type { Db, Tx } from "./db";
import { AppError } from "./errors";

/**
 * Database-backed fixed-window rate limiting. Counters live in Postgres so every serverless
 * instance shares them; one atomic upsert per check, no read-modify-write race.
 */
export type RateLimitRule = { bucket: string; limit: number; windowSeconds: number; message: string };

export const RATE_LIMITS = {
  /** Anything that calls the Google Sheets API on a faculty member's behalf (shared quota). */
  sheets: { bucket: "sheets", limit: 30, windowSeconds: 60, message: "You're doing that too quickly. Google limits how often SyncScore can read spreadsheets, so please wait a minute and try again." },
  /** Manual syncs of one course, whoever triggers them. */
  courseSync: { bucket: "course-sync", limit: 6, windowSeconds: 60, message: "This course was synced several times in the last minute. Please wait a moment before syncing again." },
  /** Course creation per faculty member. */
  createCourse: { bucket: "create-course", limit: 30, windowSeconds: 3600, message: "You've created many courses in the last hour. Please wait a while before creating more." },
} satisfies Record<string, RateLimitRule>;

/** Records one hit; returns false when the subject is over the limit for the current window. */
export async function hitRateLimit(client: Db | Tx, rule: RateLimitRule, subject: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const key = `${rule.bucket}:${subject}`.slice(0, 200);
  const rows = await client.$queryRaw<Array<{ count: number; retry: number }>>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= now() - (${rule.windowSeconds}::int * interval '1 second') THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= now() - (${rule.windowSeconds}::int * interval '1 second') THEN now() ELSE rate_limits.window_start END
    RETURNING count, CEIL(EXTRACT(EPOCH FROM (window_start + (${rule.windowSeconds}::int * interval '1 second') - now())))::int AS retry`;
  const row = rows[0];
  return { allowed: !!row && row.count <= rule.limit, retryAfterSeconds: Math.max(1, row?.retry ?? rule.windowSeconds) };
}

/** Throws RATE_LIMITED when over the limit. */
export async function enforceRateLimit(client: Db | Tx, rule: RateLimitRule, subject: string): Promise<void> {
  const { allowed, retryAfterSeconds } = await hitRateLimit(client, rule, subject);
  if (!allowed) throw new AppError("RATE_LIMITED", `${rule.message} (Try again in about ${retryAfterSeconds} s.)`);
}

/** Housekeeping: drops counters whose window ended long ago. */
export async function pruneRateLimits(client: Db | Tx): Promise<number> {
  return client.$executeRaw`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
}

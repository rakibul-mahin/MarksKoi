import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { hitRateLimit, pruneRateLimits, RATE_LIMITS } from "@/server/rate-limit";
import { resetDatabase } from "../support/factories";

const rule = { bucket: "test", limit: 3, windowSeconds: 60, message: "slow down" };

beforeEach(async () => {
  await resetDatabase();
});

describe("database rate limiter", () => {
  it("allows up to the limit per subject, then blocks", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await hitRateLimit(db, rule, "alice")).allowed);
    expect(results).toEqual([true, true, true, false, false]);
    expect((await hitRateLimit(db, rule, "bob")).allowed).toBe(true);
  });

  it("counts concurrent hits atomically (no lost updates)", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => hitRateLimit(db, rule, "burst")));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect((await db.rateLimit.findUniqueOrThrow({ where: { key: "test:burst" } })).count).toBe(10);
  });

  it("starts a new window once the old one has passed, and prunes stale rows", async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit(db, rule, "carol");
    await db.rateLimit.update({ where: { key: "test:carol" }, data: { windowStart: new Date(Date.now() - 61_000) } });
    expect((await hitRateLimit(db, rule, "carol")).allowed).toBe(true);
    await db.rateLimit.update({ where: { key: "test:carol" }, data: { windowStart: new Date(Date.now() - 2 * 86_400_000) } });
    expect(await pruneRateLimits(db)).toBe(1);
  });

  it("reports how long to wait", async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit(db, rule, "dave");
    const r = await hitRateLimit(db, rule, "dave");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keeps the configured limits sensible", () => {
    expect(RATE_LIMITS.sheets.limit).toBeGreaterThanOrEqual(10);
    expect(RATE_LIMITS.courseSync.limit).toBeLessThanOrEqual(RATE_LIMITS.sheets.limit);
  });
});

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCronSecret } from "@/server/env";
import { logger } from "@/server/logger";
import { runScheduledSyncs } from "@/server/services/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Scheduled synchronization entry point (Netlify scheduled function / GitHub Actions cron). */
export async function POST(request: Request) {
  const secret = getCronSecret();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScheduledSyncs();
  logger.info("cron.sync", { processed: result.processed });
  return NextResponse.json(result);
}

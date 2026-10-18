import "server-only";
import { isUuid } from "@/lib/ids";
import type { Viewer } from "../authz/permissions";
import { db } from "../db";
import { getServiceAccountEmail, getSyncSettings } from "../env";
import { AppError, notFound } from "../errors";
import { logger } from "../logger";
import { getSheetsClient } from "../sheets";
import { describeSheetsError, SheetsError, type SheetsClient } from "../sheets/types";
import { runSync, type SyncOutcome, type SyncTriggerValue } from "../sync/engine";
import { pruneRateLimits } from "../rate-limit";
import { clampPage } from "../validation";
import { recordAudit } from "./audit";
import { getManagedOffering, requireEditableOffering } from "./offerings";

function sheetsOrConfigError(): SheetsClient {
  try {
    return getSheetsClient();
  } catch (err) {
    if (err instanceof SheetsError) throw new AppError("CONFIG", describeSheetsError(err.code, getServiceAccountEmail()), { cause: err });
    throw err;
  }
}

export async function triggerSync(viewer: Viewer, offeringId: unknown, trigger: Extract<SyncTriggerValue, "MANUAL" | "CONFIG_CHANGE"> = "MANUAL"): Promise<SyncOutcome> {
  const { offering } = await requireEditableOffering(viewer, offeringId);
  const sheets = sheetsOrConfigError();
  const outcome = await runSync({ db, sheets }, offering.id, { trigger, actorId: viewer.profileId });
  if (trigger === "MANUAL") {
    await recordAudit(db, {
      actorId: viewer.profileId,
      action: "sync.manual",
      entityType: "sync_run",
      entityId: outcome.runId,
      offeringId: offering.id,
      metadata: { status: outcome.status },
    });
  }
  return outcome;
}

/** True when the course's last sync attempt is older than the sync interval (or never happened). */
export function isSyncDue(lastAttempt: Date | null, now = new Date(), intervalMinutes = getSyncSettings().intervalMinutes): boolean {
  return !lastAttempt || now.getTime() - lastAttempt.getTime() >= intervalMinutes * 60_000;
}

/**
 * Faculty page visit: sync in the background when the last attempt is older than the interval.
 * Re-checks everything server-side (the client only asks), so it can't be used to bypass the
 * interval or to sync a course the viewer doesn't teach.
 */
export async function autoSyncIfDue(viewer: Viewer, offeringId: unknown): Promise<{ ran: false; reason: string } | ({ ran: true } & SyncOutcome)> {
  const { offering } = await requireEditableOffering(viewer, offeringId);
  if (!offering.sheetSource) return { ran: false, reason: "not_connected" };
  if (!isSyncDue(offering.lastSyncAttemptAt)) return { ran: false, reason: "recent" };
  const hasAssessments = await db.assessment.count({ where: { offeringId: offering.id, archivedAt: null } });
  if (!hasAssessments) return { ran: false, reason: "not_configured" };
  let sheets: SheetsClient;
  try {
    sheets = getSheetsClient();
  } catch {
    return { ran: false, reason: "sheets_not_configured" };
  }
  try {
    const outcome = await runSync({ db, sheets }, offering.id, { trigger: "AUTO", actorId: viewer.profileId });
    return { ran: true, ...outcome };
  } catch (err) {
    if (err instanceof AppError && err.code === "SYNC_IN_PROGRESS") return { ran: false, reason: "in_progress" };
    throw err;
  }
}

/**
 * Scheduled synchronization (every SYNC_INTERVAL_MINUTES): processes the offerings that have
 * waited longest, one at a time, within a time budget so a serverless invocation stays short.
 * One course failing never stops the others.
 */
export async function runScheduledSyncs(opts: { budgetMs?: number; minIntervalMinutes?: number; now?: Date } = {}) {
  const { batchSize, intervalMinutes } = getSyncSettings();
  const budget = opts.budgetMs ?? 20_000;
  // A minute of slack so a course synced on the previous run is due again on this one.
  const minInterval = opts.minIntervalMinutes ?? Math.max(1, intervalMinutes - 1);
  await pruneRateLimits(db).catch((err) => logger.warn("rate_limits.prune_failed", { err }));
  const now = opts.now ?? new Date();
  const dueBefore = new Date(now.getTime() - minInterval * 60_000);
  const due = await db.courseOffering.findMany({
    where: {
      status: "ACTIVE",
      scheduledSync: true,
      sheetSource: { isNot: null },
      assessments: { some: { archivedAt: null } },
      OR: [{ lastSyncAttemptAt: null }, { lastSyncAttemptAt: { lt: dueBefore } }],
    },
    orderBy: [{ lastSyncAttemptAt: { sort: "asc", nulls: "first" } }],
    take: batchSize,
    select: { id: true },
  });
  const results: Array<{ offeringId: string; status: string }> = [];
  if (due.length === 0) return { processed: 0, results };
  let sheets: SheetsClient;
  try {
    sheets = getSheetsClient();
  } catch (err) {
    logger.error("sync.scheduled_config_error", { err });
    return { processed: 0, results, error: "Sheets is not configured" };
  }
  const started = Date.now();
  for (const o of due) {
    if (Date.now() - started > budget) break;
    try {
      const outcome = await runSync({ db, sheets }, o.id, { trigger: "SCHEDULED", actorId: null });
      results.push({ offeringId: o.id, status: outcome.status });
    } catch (err) {
      const status = err instanceof AppError && err.code === "SYNC_IN_PROGRESS" ? "SKIPPED_RUNNING" : "ERROR";
      if (status === "ERROR") logger.error("sync.scheduled_failed", { offeringId: o.id, err });
      results.push({ offeringId: o.id, status });
    }
  }
  return { processed: results.length, results };
}

export async function listSyncRuns(viewer: Viewer, offeringId: unknown, page = 1) {
  const { offering } = await getManagedOffering(viewer, offeringId);
  const pageSize = 15;
  const [runs, total] = await Promise.all([
    db.syncRun.findMany({
      where: { offeringId: offering.id },
      orderBy: { startedAt: "desc" },
      skip: (clampPage(page) - 1) * pageSize,
      take: pageSize,
      include: { triggeredBy: { select: { name: true, email: true } } },
    }),
    db.syncRun.count({ where: { offeringId: offering.id } }),
  ]);
  return { offering, runs, total, page: clampPage(page), pageSize };
}

export async function getSyncRunIssues(viewer: Viewer, offeringId: unknown, runId: unknown) {
  const { offering } = await getManagedOffering(viewer, offeringId);
  if (!isUuid(runId)) throw notFound("Sync run");
  const run = await db.syncRun.findFirst({
    where: { id: runId, offeringId: offering.id },
    include: { issues: { orderBy: [{ severity: "asc" }, { worksheetTitle: "asc" }, { rowNumber: "asc" }], take: 500 } },
  });
  if (!run) throw notFound("Sync run");
  return run;
}

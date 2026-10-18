import "server-only";
import { randomUUID } from "node:crypto";
import type { Db, Tx } from "../db";
import { getDomainPolicyConfig } from "../env";
import { AppError } from "../errors";
import { logger } from "../logger";
import { activeSnapshotAssessmentIds, createSnapshot } from "../services/publication-core";
import { recordAudit } from "../services/audit";
import { SheetsError, type Grid, type SheetsClient } from "../sheets/types";
import { buildSnapshot, requiredWorksheets, resolveWorksheets, type BuildOutput, type Issue, type SyncConfig } from "./build";
import { resolveIdentities } from "./identity";
import { acquireLease, assertLeaseHeld, releaseLease } from "./lease";
import { massRemovalCheck, planEnrollments, planMarkWrites, type MarkWrite } from "./plan";

export type SyncTriggerValue = "MANUAL" | "SCHEDULED" | "CONFIG_CHANGE" | "AUTO";
export type SyncOutcome = {
  runId: string;
  status: "SUCCEEDED" | "PARTIAL" | "VALIDATION_FAILED" | "FAILED";
  summary: string;
  errorCount: number;
  warningCount: number;
  autoPublished: boolean;
};

const MAX_STORED_ISSUES = 500;
const MARK_CHUNK = 500;

type LoadedConfig = {
  offering: { id: string; status: string; autoPublish: boolean; publicationStatus: string };
  spreadsheetId: string;
  config: SyncConfig;
};

/** Loads the persisted mapping into the pure builder's shape. */
export async function loadSyncConfig(client: Db | Tx, offeringId: string): Promise<LoadedConfig> {
  const offering = await client.courseOffering.findUnique({
    where: { id: offeringId },
    include: {
      sheetSource: { include: { worksheets: { orderBy: { title: "asc" } } } },
      assessments: { where: { archivedAt: null }, include: { columns: true }, orderBy: { displayOrder: "asc" } },
    },
  });
  if (!offering) throw new AppError("NOT_FOUND", "Course offering not found.");
  if (!offering.sheetSource) throw new AppError("VALIDATION", "Connect a Google spreadsheet before syncing.");
  const domains = getDomainPolicyConfig();
  return {
    offering: { id: offering.id, status: offering.status, autoPublish: offering.autoPublish, publicationStatus: offering.publicationStatus },
    spreadsheetId: offering.sheetSource.spreadsheetId,
    config: {
      studentDomains: domains.studentDomains,
      worksheets: offering.sheetSource.worksheets.map((w) => ({
        id: w.id,
        googleSheetId: w.googleSheetId,
        title: w.title,
        enabled: w.enabled,
        isRoster: w.isRoster,
        headerRow: w.headerRow,
        headerRows: w.headerRows,
        dataStartRow: w.dataStartRow,
        studentIdHeader: w.studentIdHeader,
        emailHeader: w.emailHeader,
        nameHeader: w.nameHeader,
        knownHeaders: w.knownHeaders,
      })),
      assessments: offering.assessments.map((a) => ({
        id: a.id,
        name: a.name,
        valueType: a.valueType,
        maxScore: a.maxScore ? a.maxScore.toString() : null,
        columns: a.columns.map((c) => ({
          id: c.id,
          worksheetId: c.worksheetId,
          header: c.header,
          normalizedHeader: c.normalizedHeader,
          lastColumnIndex: c.lastColumnIndex,
        })),
      })),
    },
  };
}

/** Fetches and validates without writing anything (used by Preview and by the engine). */
export async function fetchAndBuild(sheets: SheetsClient, spreadsheetId: string, config: SyncConfig): Promise<BuildOutput & { spreadsheetTitle: string }> {
  const meta = await sheets.getSpreadsheet(spreadsheetId);
  const resolution = resolveWorksheets(config, meta);
  const needed = resolution.resolved.filter((r) => requiredWorksheets(config).some((w) => w.id === r.config.id));
  const grids = new Map<string, Grid>();
  if (!resolution.issues.some((i) => i.structural) && needed.length > 0) {
    const values = await sheets.getWorksheetValues(
      spreadsheetId,
      needed.map((r) => r.currentTitle),
    );
    needed.forEach((r, i) => grids.set(r.config.id, values[i] ?? []));
  }
  return { ...buildSnapshot(config, resolution, grids), spreadsheetTitle: meta.title };
}

function capIssues(issues: Issue[]): Issue[] {
  if (issues.length <= MAX_STORED_ISSUES) return issues;
  const kept = issues.slice(0, MAX_STORED_ISSUES - 1);
  kept.push({ severity: "WARNING", code: "MORE_ISSUES", message: `${issues.length - kept.length} more problems were found but not listed. Fix the ones above and sync again.` });
  return kept;
}

function counts(issues: Issue[]) {
  return {
    errorCount: issues.filter((i) => i.severity === "ERROR").length,
    warningCount: issues.filter((i) => i.severity === "WARNING").length,
  };
}

async function writeIssues(client: Db | Tx, runId: string, issues: Issue[]) {
  const capped = capIssues(issues);
  if (capped.length === 0) return;
  await client.syncIssue.createMany({
    data: capped.map((i) => ({
      syncRunId: runId,
      severity: i.severity,
      code: i.code,
      worksheetTitle: i.worksheetTitle ?? null,
      rowNumber: i.rowNumber ?? null,
      columnHeader: i.columnHeader ?? null,
      message: i.message.slice(0, 1000),
    })),
  });
}

/**
 * Runs one synchronization for an offering. Never throws for data/Google problems: those are
 * recorded on the run. Throws AppError("SYNC_IN_PROGRESS") if another sync holds the lease.
 */
export async function runSync(
  deps: { db: Db; sheets: SheetsClient },
  offeringId: string,
  opts: { trigger: SyncTriggerValue; actorId: string | null },
): Promise<SyncOutcome> {
  const { db } = deps;
  const token = await acquireLease(db, offeringId);
  if (!token) throw new AppError("SYNC_IN_PROGRESS", "A sync for this course is already running. Please wait for it to finish.");

  const started = Date.now();
  let runId: string | null = null;
  try {
    // We hold the lease, so any RUNNING run left behind is from a crashed process.
    await db.syncRun.updateMany({
      where: { offeringId, status: "RUNNING" },
      data: { status: "FAILED", errorCode: "INTERRUPTED", summary: "This sync was interrupted before it finished. No data was changed.", finishedAt: new Date() },
    });
    const run = await db.syncRun.create({ data: { offeringId, trigger: opts.trigger, triggeredById: opts.actorId, status: "RUNNING" } });
    runId = run.id;
    await db.courseOffering.update({ where: { id: offeringId }, data: { lastSyncAttemptAt: new Date() } });

    const loaded = await loadSyncConfig(db, offeringId);
    if (loaded.offering.status === "ARCHIVED") {
      return await finishWithoutChanges(db, runId, offeringId, started, "VALIDATION_FAILED", "This course is archived, so it is no longer synchronized.", [], "ARCHIVED");
    }
    if (loaded.config.assessments.length === 0) {
      return await finishWithoutChanges(db, runId, offeringId, started, "VALIDATION_FAILED", "No assessments are mapped yet. Map at least one column before syncing.", [], "NOT_CONFIGURED");
    }

    const built = await fetchAndBuild(deps.sheets, loaded.spreadsheetId, loaded.config);
    if (built.structuralErrors) {
      return await finishWithoutChanges(
        db,
        runId,
        offeringId,
        started,
        "VALIDATION_FAILED",
        "The spreadsheet has problems that need your attention. Your previously synced marks were kept.",
        built.issues,
      );
    }

    // Identity resolution against platform profiles (only students with an official email).
    const rosterTitle = loaded.config.worksheets.find((w) => w.isRoster)?.title ?? "Roster";
    const withEmail = built.roster.filter((s): s is typeof s & { email: string } => !!s.email);
    const emails = withEmail.map((s) => s.email);
    const ids = withEmail.map((s) => s.studentId).filter((x): x is string => !!x);
    const profiles = await db.profile.findMany({
      where: { OR: [{ email: { in: emails } }, ...(ids.length ? [{ studentId: { in: ids } }] : [])] },
      select: { id: true, email: true, studentId: true },
    });
    const identity = resolveIdentities(withEmail, profiles, randomUUID, rosterTitle);
    let issues = [...built.issues, ...identity.issues];
    if (!identity.ok) {
      return await finishWithoutChanges(db, runId, offeringId, started, "VALIDATION_FAILED", "Some students in the roster conflict with existing accounts. Your previously synced marks were kept.", issues);
    }

    // Enrollment diff (including pending-access students without an official email).
    const existingEnrollments = await db.enrollment.findMany({
      where: { offeringId },
      select: { id: true, studentProfileId: true, status: true, sourceEmail: true, sourceStudentId: true, sourceName: true, sourceRow: true },
    });
    const enrollments = planEnrollments(built.roster, identity.profileByStudentKey, existingEnrollments, randomUUID);
    if (enrollments.stillLinkedRows.length) {
      // These students were linked to their account earlier; they keep access, so drop the warning.
      const rows = new Set(enrollments.stillLinkedRows);
      issues = issues.filter((i) => !(i.code === "NO_PORTAL_EMAIL" && i.rowNumber !== undefined && rows.has(i.rowNumber)));
    }
    const toRemove = enrollments.removeIds;
    const activeCount = existingEnrollments.filter((e) => e.status === "ACTIVE").length;
    const removal = massRemovalCheck(activeCount, toRemove.length);
    if (!removal.ok) {
      issues.push({ severity: "ERROR", code: "MASS_REMOVAL_BLOCKED", structural: true, message: removal.message });
      return await finishWithoutChanges(db, runId, offeringId, started, "VALIDATION_FAILED", removal.message, issues);
    }
    const enrollmentCreates = enrollments.creates.map((c) => ({ ...c, offeringId }));
    const enrollmentUpdates = enrollments.updates;
    const enrollmentByStudentKey = enrollments.enrollmentByStudentKey;
    const reactivated = enrollments.reactivated;

    const storedMarks = await db.mark.findMany({
      where: { offeringId },
      select: { enrollmentId: true, assessmentId: true, status: true, score: true, textValue: true },
    });
    const plan = planMarkWrites(
      built.cells,
      built.invalidCellKeys,
      enrollmentByStudentKey,
      storedMarks.map((m) => ({ ...m, score: m.score ? m.score.toString() : null })),
    );

    const { errorCount, warningCount } = counts(issues);
    const status = errorCount > 0 ? "PARTIAL" : "SUCCEEDED";
    const summaryParts = [
      `${built.roster.length} students`,
      `${plan.created + plan.updated} marks changed`,
      enrollmentCreates.length + reactivated ? `${enrollmentCreates.length + reactivated} students added` : null,
      toRemove.length ? `${toRemove.length} students removed` : null,
      enrollments.pending ? `${enrollments.pending} without portal access (no official email)` : null,
      enrollments.linked ? `${enrollments.linked} linked to their accounts` : null,
      errorCount ? `${errorCount} problems need attention` : null,
    ].filter(Boolean);

    let autoPublished = false;
    await db.$transaction(
      async (tx) => {
        if (!(await assertLeaseHeld(tx, offeringId, token))) {
          throw new AppError("SYNC_IN_PROGRESS", "The sync lock expired before changes could be saved. Please try again.");
        }
        if (identity.creates.length) {
          await tx.profile.createMany({ data: identity.creates.map((c) => ({ id: c.id, email: c.email, studentId: c.studentId, name: c.name })) });
          await tx.userRole.createMany({ data: identity.creates.map((c) => ({ profileId: c.id, role: "STUDENT" as const })), skipDuplicates: true });
        }
        for (const u of identity.studentIdUpdates) {
          await tx.profile.updateMany({ where: { id: u.profileId, studentId: null }, data: { studentId: u.studentId } });
        }
        if (enrollmentCreates.length) await tx.enrollment.createMany({ data: enrollmentCreates });
        for (const u of enrollmentUpdates) await tx.enrollment.update({ where: { id: u.id }, data: u.data });
        if (toRemove.length) {
          await tx.enrollment.updateMany({ where: { id: { in: toRemove } }, data: { status: "REMOVED", removedAt: new Date() } });
        }
        await upsertMarks(tx, offeringId, runId!, plan.writes);
        for (const w of built.worksheetUpdates) {
          await tx.sheetWorksheet.update({ where: { id: w.worksheetId }, data: { title: w.title, knownHeaders: w.knownHeaders } });
        }
        for (const c of built.columnUpdates) {
          await tx.assessmentColumn.update({ where: { id: c.columnId }, data: { lastColumnIndex: c.index } });
        }
        await tx.sheetSource.update({
          where: { offeringId },
          data: { status: "CONNECTED", spreadsheetTitle: built.spreadsheetTitle, lastErrorCode: null, lastErrorMessage: null, lastVerifiedAt: new Date() },
        });

        // Auto-publish republishes the currently published assessment set, only for clean runs.
        if (status === "SUCCEEDED" && loaded.offering.autoPublish && loaded.offering.publicationStatus === "PUBLISHED") {
          const published = await activeSnapshotAssessmentIds(tx, offeringId);
          const stillMapped = (published ?? []).filter((id) => loaded.config.assessments.some((a) => a.id === id));
          if (stillMapped.length > 0 && plan.writes.length + enrollmentCreates.length + toRemove.length > 0) {
            await createSnapshot(tx, { offeringId, assessmentIds: stillMapped, actorId: null, sourceSyncRunId: runId, note: "Automatically republished after sync" });
            await recordAudit(tx, { actorId: null, action: "publication.auto_published", entityType: "offering", entityId: offeringId, offeringId, metadata: { syncRunId: runId } });
            autoPublished = true;
          }
        }

        await writeIssues(tx, runId!, issues);
        await tx.syncRun.update({
          where: { id: runId! },
          data: {
            status,
            finishedAt: new Date(),
            durationMs: Date.now() - started,
            rowsRead: built.rowsRead,
            studentsMatched: built.roster.length,
            enrollmentsAdded: enrollmentCreates.length + reactivated,
            enrollmentsRemoved: toRemove.length,
            marksCreated: plan.created,
            marksUpdated: plan.updated,
            marksUnchanged: plan.unchanged,
            errorCount,
            warningCount,
            summary: summaryParts.join(" · "),
            autoPublished,
          },
        });
        await tx.courseOffering.update({
          where: { id: offeringId },
          data: { lastSyncStatus: status, lastSyncSuccessAt: new Date() },
        });
      },
      { timeout: 25_000, maxWait: 10_000 },
    );

    logger.info("sync.completed", { offeringId, runId, status, changed: plan.writes.length, ms: Date.now() - started });
    return { runId, status, summary: summaryParts.join(" · "), errorCount, warningCount, autoPublished };
  } catch (err) {
    if (err instanceof AppError && err.code === "SYNC_IN_PROGRESS" && !runId) throw err;
    if (err instanceof AppError && err.code === "VALIDATION" && runId) {
      return await finishWithoutChanges(db, runId, offeringId, started, "VALIDATION_FAILED", err.userMessage, [], "NOT_CONFIGURED");
    }
    const code = err instanceof SheetsError ? err.code : err instanceof AppError ? err.code : "INTERNAL";
    logger.error("sync.failed", { offeringId, runId, code, err });
    const summary = err instanceof SheetsError
      ? sheetsFailureSummary(err)
      : err instanceof AppError
        ? err.userMessage
        : "The sync failed unexpectedly. Your previously synced marks were kept.";
    if (err instanceof SheetsError && ["NOT_SHARED", "NOT_FOUND", "UNSUPPORTED_DOCUMENT"].includes(err.code)) {
      await db.sheetSource
        .update({ where: { offeringId }, data: { status: "ERROR", lastErrorCode: err.code, lastErrorMessage: summary } })
        .catch(() => undefined);
    }
    if (!runId) throw err;
    return await finishWithoutChanges(db, runId, offeringId, started, "FAILED", summary, [], code);
  } finally {
    await releaseLease(db, offeringId, token).catch((err) => logger.error("sync.lease_release_failed", { offeringId, err }));
  }
}

function sheetsFailureSummary(err: SheetsError): string {
  const base: Record<string, string> = {
    NOT_SHARED: "SyncScore can no longer open the spreadsheet. Check that it is still shared with the service account.",
    NOT_FOUND: "The spreadsheet could not be found. It may have been deleted or moved.",
    UNSUPPORTED_DOCUMENT: "The connected file isn't a Google Sheets spreadsheet.",
    RATE_LIMITED: "Google is temporarily limiting requests.",
    UNAVAILABLE: "Google Sheets was temporarily unavailable.",
    TIMEOUT: "Google Sheets didn't respond in time.",
    AUTH_FAILED: "SyncScore's Google credentials were rejected.",
    API_DISABLED: "The Google Sheets API is disabled for SyncScore's project.",
    CONFIG: "Google Sheets access isn't configured on the server.",
    INVALID_REQUEST: "Google Sheets rejected the request.",
  };
  return `${base[err.code] ?? "Google Sheets returned an error."} Your previously synced marks were kept.`;
}

async function finishWithoutChanges(
  db: Db,
  runId: string,
  offeringId: string,
  started: number,
  status: "VALIDATION_FAILED" | "FAILED",
  summary: string,
  issues: Issue[],
  errorCode?: string,
): Promise<SyncOutcome> {
  const { errorCount, warningCount } = counts(issues);
  await db.$transaction(async (tx) => {
    await writeIssues(tx, runId, issues);
    await tx.syncRun.update({
      where: { id: runId },
      data: { status, finishedAt: new Date(), durationMs: Date.now() - started, summary, errorCode: errorCode ?? null, errorCount, warningCount },
    });
    await tx.courseOffering.update({ where: { id: offeringId }, data: { lastSyncStatus: status } });
  });
  logger.warn("sync.not_applied", { offeringId, runId, status, errorCode, errorCount });
  return { runId, status, summary, errorCount, warningCount, autoPublished: false };
}

/** Batched INSERT … ON CONFLICT using unnest so large classes need few round trips. */
async function upsertMarks(tx: Tx, offeringId: string, runId: string, writes: MarkWrite[]) {
  for (let i = 0; i < writes.length; i += MARK_CHUNK) {
    const chunk = writes.slice(i, i + MARK_CHUNK);
    const enrollmentIds = chunk.map((w) => w.enrollmentId);
    const assessmentIds = chunk.map((w) => w.assessmentId);
    const statuses = chunk.map((w) => w.status);
    const scores = chunk.map((w) => w.score);
    const texts = chunk.map((w) => w.textValue);
    const raws = chunk.map((w) => w.rawValue);
    await tx.$executeRaw`
      INSERT INTO marks (id, offering_id, enrollment_id, assessment_id, status, score, text_value, raw_value, source_sync_run_id, created_at, updated_at)
      SELECT gen_random_uuid(), ${offeringId}::uuid, x.e, x.a, x.s::"MarkStatus", x.sc::numeric, x.t, x.r, ${runId}::uuid, now(), now()
        FROM unnest(${enrollmentIds}::uuid[], ${assessmentIds}::uuid[], ${statuses}::text[], ${scores}::text[], ${texts}::text[], ${raws}::text[])
             AS x(e, a, s, sc, t, r)
      ON CONFLICT (enrollment_id, assessment_id) DO UPDATE
         SET status = EXCLUDED.status, score = EXCLUDED.score, text_value = EXCLUDED.text_value,
             raw_value = EXCLUDED.raw_value, source_sync_run_id = EXCLUDED.source_sync_run_id, updated_at = now()`;
  }
}

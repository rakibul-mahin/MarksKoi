import "server-only";
import { z } from "zod";
import { cleanHeader, normalizeHeader } from "@/lib/normalize";
import { combinedHeaders, MAX_HEADER_ROWS } from "@/lib/sheet-layout";
import type { Viewer } from "../authz/permissions";
import { db } from "../db";
import { getDomainPolicyConfig, getServiceAccountEmail } from "../env";
import { AppError } from "../errors";
import { logger } from "../logger";
import { getSheetsClient } from "../sheets";
import { parseSpreadsheetId } from "../sheets/spreadsheet-id";
import { describeSheetsError, SheetsError, type SpreadsheetMeta } from "../sheets/types";
import { fetchAndBuild } from "../sync/engine";
import { MAX_DATA_START_ROW, validateMapping, type MappingProblem } from "@/lib/mapping-validate";
import type { SyncConfig } from "../sync/build";
import { parseInput } from "../validation";
import { recordAudit } from "./audit";
import { getManagedOffering, requireEditableOffering } from "./offerings";

/** Rows sent to the mapping editor for choosing title rows and previewing data. */
const SAMPLE_ROWS = 20;

/** Converts Google errors into faculty-facing AppErrors. */
async function sheetsCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SheetsError) {
      logger.warn("sheets.call_failed", { code: err.code });
      throw new AppError("SHEETS_ERROR", describeSheetsError(err.code, getServiceAccountEmail()), { cause: err });
    }
    throw err;
  }
}

function gridWorksheets(meta: SpreadsheetMeta) {
  return meta.sheets.filter((s) => s.sheetType === "GRID");
}

/** Step 1: connect (or replace) the spreadsheet after verifying the service account can read it. */
export async function connectSpreadsheet(viewer: Viewer, offeringId: unknown, rawInput: unknown) {
  const { offering } = await requireEditableOffering(viewer, offeringId);
  const input = String(rawInput ?? "");
  const spreadsheetId = parseSpreadsheetId(input);
  if (!spreadsheetId) {
    throw new AppError("VALIDATION", "Paste the full Google Sheets link (it looks like https://docs.google.com/spreadsheets/d/…).", {
      fieldErrors: { spreadsheet: "That doesn't look like a Google Sheets link." },
    });
  }
  // The service account can read every sheet shared with it. Don't let one instructor attach a
  // spreadsheet that already belongs to a course they don't teach (one instructor may reuse a
  // sheet across their own sections).
  const elsewhere = await db.sheetSource.findMany({
    where: { spreadsheetId, offeringId: { not: offering.id } },
    select: { offering: { select: { faculty: { where: { profileId: viewer.profileId }, select: { profileId: true } } } } },
  });
  if (elsewhere.some((s) => s.offering.faculty.length === 0)) {
    throw new AppError("CONFLICT", "This spreadsheet is already connected to a course you don't teach. Ask that course's instructor to add you as a co-instructor, or use your own copy of the sheet.", {
      fieldErrors: { spreadsheet: "Already used by another instructor's course." },
    });
  }
  const meta = await sheetsCall(() => getSheetsClient().getSpreadsheet(spreadsheetId));
  const sheets = gridWorksheets(meta);
  if (sheets.length === 0) throw new AppError("VALIDATION", "This spreadsheet has no worksheets SyncScore can read.");

  await db.$transaction(async (tx) => {
    const existing = await tx.sheetSource.findUnique({ where: { offeringId: offering.id } });
    const replacing = existing && existing.spreadsheetId !== spreadsheetId;
    if (replacing) {
      // A different spreadsheet has different worksheet ids: drop worksheet + column mappings.
      // Assessments (and their synced / published marks) are kept and can be re-mapped.
      await tx.sheetWorksheet.deleteMany({ where: { sourceId: existing.id } });
    }
    const source = await tx.sheetSource.upsert({
      where: { offeringId: offering.id },
      update: {
        spreadsheetId,
        spreadsheetTitle: meta.title,
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        connectedById: viewer.profileId,
      },
      create: {
        offeringId: offering.id,
        spreadsheetId,
        spreadsheetTitle: meta.title,
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
        connectedById: viewer.profileId,
      },
    });
    await syncWorksheetRows(tx, source.id, meta);
    await recordAudit(tx, {
      actorId: viewer.profileId,
      action: replacing ? "source.replaced" : "source.connected",
      entityType: "sheet_source",
      entityId: source.id,
      offeringId: offering.id,
      metadata: { worksheetCount: sheets.length },
    });
  });
  return { spreadsheetTitle: meta.title, worksheetCount: sheets.length };
}

/** Keeps worksheet rows in step with live metadata (new tabs are added disabled). */
async function syncWorksheetRows(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], sourceId: string, meta: SpreadsheetMeta) {
  const rows = await tx.sheetWorksheet.findMany({ where: { sourceId } });
  for (const s of gridWorksheets(meta)) {
    const row = rows.find((r) => r.googleSheetId === s.sheetId);
    if (!row) await tx.sheetWorksheet.create({ data: { sourceId, googleSheetId: s.sheetId, title: s.title, enabled: false } });
    else if (row.title !== s.title) await tx.sheetWorksheet.update({ where: { id: row.id }, data: { title: s.title } });
  }
}

/** "Verify connection": re-reads metadata and reports configured vs. live worksheets. */
export async function verifyConnection(viewer: Viewer, offeringId: unknown) {
  const { offering } = await requireEditableOffering(viewer, offeringId);
  const source = await db.sheetSource.findUnique({ where: { offeringId: offering.id } });
  if (!source) throw new AppError("VALIDATION", "Connect a spreadsheet first.");
  let meta: SpreadsheetMeta;
  try {
    meta = await sheetsCall(() => getSheetsClient().getSpreadsheet(source.spreadsheetId));
  } catch (err) {
    if (err instanceof AppError && err.code === "SHEETS_ERROR") {
      const code = err.cause instanceof SheetsError ? err.cause.code : "UNKNOWN";
      await db.sheetSource.update({ where: { id: source.id }, data: { status: "ERROR", lastErrorCode: code, lastErrorMessage: err.userMessage } });
    }
    throw err;
  }
  await db.$transaction(async (tx) => {
    await tx.sheetSource.update({
      where: { id: source.id },
      data: { status: "CONNECTED", spreadsheetTitle: meta.title, lastVerifiedAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
    });
    await syncWorksheetRows(tx, source.id, meta);
    await recordAudit(tx, { actorId: viewer.profileId, action: "source.verified", entityType: "sheet_source", entityId: source.id, offeringId: offering.id });
  });
  return { spreadsheetTitle: meta.title, worksheetCount: gridWorksheets(meta).length };
}

/** Everything the mapping editor needs: worksheets, live headers + sample rows, current mapping. */
export async function getMappingEditorData(viewer: Viewer, offeringId: unknown) {
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  const source = await db.sheetSource.findUnique({
    where: { offeringId: offering.id },
    include: { worksheets: { orderBy: { title: "asc" } } },
  });
  const assessments = await db.assessment.findMany({
    where: { offeringId: offering.id, archivedAt: null },
    include: { group: true, columns: true },
    orderBy: [{ group: { displayOrder: "asc" } }, { displayOrder: "asc" }],
  });
  const groups = await db.assessmentGroup.findMany({ where: { offeringId: offering.id }, orderBy: { displayOrder: "asc" } });
  if (!source) return { offering, facts, source: null, worksheets: [], assessments, groups, liveError: null };

  let liveError: string | null = null;
  let meta: SpreadsheetMeta | null = null;
  let grids: unknown[][][] = [];
  try {
    meta = await sheetsCall(() => getSheetsClient().getSpreadsheet(source.spreadsheetId));
    const titles = gridWorksheets(meta).map((s) => s.title);
    // Only the top rows are shown, so don't download whole gradebooks on every page load.
    grids = await sheetsCall(() => getSheetsClient().getWorksheetValues(source.spreadsheetId, titles, { maxRows: SAMPLE_ROWS }));
  } catch (err) {
    liveError = err instanceof AppError ? err.userMessage : "Couldn't read the spreadsheet.";
  }
  const live = meta ? gridWorksheets(meta) : [];
  // Spreadsheet tab order, with the class list first and missing tabs last.
  const position = (w: (typeof source.worksheets)[number]) => {
    const idx = live.findIndex((s) => s.sheetId === w.googleSheetId);
    return w.isRoster ? -1 : idx === -1 ? 10_000 : (live[idx]?.index ?? idx);
  };
  const worksheets = [...source.worksheets].sort((a, b) => position(a) - position(b)).map((w) => {
    const idx = live.findIndex((s) => s.sheetId === w.googleSheetId);
    const grid = idx >= 0 ? (grids[idx] ?? []) : [];
    return {
      id: w.id,
      googleSheetId: w.googleSheetId,
      title: idx >= 0 ? live[idx].title : w.title,
      present: idx >= 0,
      enabled: w.enabled,
      isRoster: w.isRoster,
      headerRow: w.headerRow,
      headerRows: w.headerRows,
      dataStartRow: w.dataStartRow,
      studentIdHeader: w.studentIdHeader,
      emailHeader: w.emailHeader,
      nameHeader: w.nameHeader,
      // Rows from the top (merged cells already expanded) so faculty can pick the title rows and
      // where students start, and see sample data.
      sampleRows: grid.slice(0, SAMPLE_ROWS).map((r) => (r as unknown[]).slice(0, 60).map((v) => (v === null || v === undefined ? "" : String(v).slice(0, 120)))),
    };
  });
  return { offering, facts, source, worksheets, assessments, groups, liveError };
}

const nullableHeader = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const mappingSchema = z.object({
  worksheets: z
    .array(
      z.object({
        googleSheetId: z.number().int().min(0),
        enabled: z.boolean(),
        isRoster: z.boolean(),
        headerRow: z.number().int().min(1).max(50),
        headerRows: z.number().int().min(1).max(MAX_HEADER_ROWS).default(1),
        dataStartRow: z.number().int().min(2).max(MAX_DATA_START_ROW).nullable().optional().transform((v) => v ?? null),
        studentIdHeader: nullableHeader,
        emailHeader: nullableHeader,
        nameHeader: nullableHeader,
      }),
    )
    .max(100),
  assessments: z
    .array(
      z.object({
        id: z.string().uuid().nullable().optional(),
        key: z.string().min(1).max(64),
        name: z.string().trim().min(1, "Every assessment needs a name.").max(80),
        groupName: z.string().trim().min(1, "Choose a category.").max(60),
        valueType: z.enum(["NUMERIC", "TEXT", "BOOLEAN", "COUNT", "PERCENT", "ATTENDANCE", "STATUS"]),
        threshold: z.string().trim().nullable().optional().transform((v) => (v ? v : null)),
        kind: z.enum(["REGULAR", "OFFICIAL_TOTAL", "OFFICIAL_GRADE"]),
        maxScore: z.string().trim().nullable().optional().transform((v) => (v ? v : null)),
        columns: z.array(z.object({ googleSheetId: z.number().int().min(0), header: z.string().trim().min(1).max(200) })).max(20),
      })
      // An official grade is a letter grade ("A+", "B-"): always text, never a number with a maximum.
      .transform((a) => (a.kind === "OFFICIAL_GRADE" ? { ...a, valueType: "TEXT" as const, maxScore: null } : a))
      // Only marks have a maximum; only percentages have a threshold.
      .transform((a) => ({ ...a, maxScore: a.valueType === "NUMERIC" ? a.maxScore : null, threshold: a.valueType === "PERCENT" ? a.threshold : null })),
    )
    .max(300),
  acknowledgeWarnings: z.boolean().optional(),
});
export type MappingPayload = z.input<typeof mappingSchema>;

type LiveHeaders = Map<number, { title: string; headers: string[] }>;

async function readLiveHeaders(spreadsheetId: string, payload: z.infer<typeof mappingSchema>): Promise<LiveHeaders> {
  const meta = await sheetsCall(() => getSheetsClient().getSpreadsheet(spreadsheetId));
  const wanted = payload.worksheets.filter((w) => w.enabled);
  const live = wanted.map((w) => ({ w, meta: meta.sheets.find((s) => s.sheetId === w.googleSheetId) }));
  const missing = live.filter((l) => !l.meta);
  if (missing.length) throw new AppError("VALIDATION", "Some selected worksheets no longer exist in the spreadsheet. Click “Verify connection” to refresh.");
  // Headers only: read just down to the lowest title row.
  const maxRows = Math.max(1, ...wanted.map((w) => w.headerRow + w.headerRows - 1));
  const grids = await sheetsCall(() => getSheetsClient().getWorksheetValues(spreadsheetId, live.map((l) => l.meta!.title), { maxRows }));
  const out: LiveHeaders = new Map();
  live.forEach((l, i) => {
    // Keep blanks so array positions equal real column indexes.
    out.set(l.w.googleSheetId, { title: l.meta!.title, headers: combinedHeaders(grids[i] ?? [], l.w.headerRow, l.w.headerRows) });
  });
  return out;
}

function validatePayload(payload: z.infer<typeof mappingSchema>, worksheetIds: Map<number, string>, live: LiveHeaders): MappingProblem[] {
  return validateMapping(
    payload.worksheets.map((w) => ({
      id: String(w.googleSheetId),
      title: live.get(w.googleSheetId)?.title ?? `Worksheet ${w.googleSheetId}`,
      enabled: w.enabled,
      isRoster: w.isRoster,
      headerRow: w.headerRow,
      headerRows: w.headerRows,
      dataStartRow: w.dataStartRow,
      studentIdHeader: w.studentIdHeader,
      emailHeader: w.emailHeader,
      nameHeader: w.nameHeader,
      availableHeaders: (live.get(w.googleSheetId)?.headers ?? []).filter(Boolean),
    })),
    payload.assessments.map((a) => ({
      key: a.key,
      name: a.name,
      groupName: a.groupName,
      valueType: a.valueType,
      maxScore: a.maxScore,
      threshold: a.threshold,
      columns: a.columns.map((c) => ({ worksheetId: worksheetIds.has(c.googleSheetId) ? String(c.googleSheetId) : `missing-${c.googleSheetId}`, header: c.header })),
    })),
  );
}

async function loadSourceForMapping(offeringId: string) {
  const source = await db.sheetSource.findUnique({ where: { offeringId }, include: { worksheets: true } });
  if (!source) throw new AppError("VALIDATION", "Connect a spreadsheet first.");
  return source;
}

/** Builds an in-memory SyncConfig from an unsaved payload (for Preview). */
function configFromPayload(payload: z.infer<typeof mappingSchema>, worksheetIdBySheet: Map<number, string>, titles: Map<number, string>, knownHeaders: Map<number, string[]>): SyncConfig {
  return {
    studentDomains: getDomainPolicyConfig().studentDomains,
    worksheets: payload.worksheets.map((w) => ({
      id: worksheetIdBySheet.get(w.googleSheetId) ?? `ws-${w.googleSheetId}`,
      googleSheetId: w.googleSheetId,
      title: titles.get(w.googleSheetId) ?? "",
      enabled: w.enabled,
      isRoster: w.isRoster && w.enabled,
      headerRow: w.headerRow,
      headerRows: w.headerRows,
      dataStartRow: w.dataStartRow,
      studentIdHeader: w.studentIdHeader,
      emailHeader: w.emailHeader,
      nameHeader: w.nameHeader,
      knownHeaders: knownHeaders.get(w.googleSheetId) ?? [],
    })),
    assessments: payload.assessments.map((a) => ({
      id: a.id ?? `new-${a.key}`,
      name: a.name,
      valueType: a.valueType,
      maxScore: a.valueType === "NUMERIC" ? a.maxScore : null,
      columns: a.columns.map((c, i) => ({
        id: `${a.key}-${i}`,
        worksheetId: worksheetIdBySheet.get(c.googleSheetId) ?? `ws-${c.googleSheetId}`,
        header: c.header,
        normalizedHeader: normalizeHeader(c.header),
        lastColumnIndex: null,
      })),
    })),
  };
}

/** Preview: validates an unsaved mapping against live data. Writes nothing. */
export async function previewMapping(viewer: Viewer, offeringId: unknown, raw: unknown) {
  const { offering } = await requireEditableOffering(viewer, offeringId);
  const payload = parseInput(mappingSchema, raw);
  const source = await loadSourceForMapping(offering.id);
  const worksheetIdBySheet = new Map(source.worksheets.map((w) => [w.googleSheetId, w.id]));
  const live = await readLiveHeaders(source.spreadsheetId, payload);
  const problems = validatePayload(payload, worksheetIdBySheet, live);
  if (problems.some((p) => p.severity === "error")) {
    return { ok: false as const, problems, preview: null };
  }
  const config = configFromPayload(
    payload,
    worksheetIdBySheet,
    new Map([...live].map(([k, v]) => [k, v.title])),
    new Map(source.worksheets.map((w) => [w.googleSheetId, w.knownHeaders])),
  );
  const built = await sheetsCall(() => fetchAndBuild(getSheetsClient(), source.spreadsheetId, config));
  const assessments = payload.assessments.map((a) => ({ id: a.id ?? `new-${a.key}`, name: a.name, valueType: a.valueType, maxScore: a.maxScore, threshold: a.threshold }));
  const byStudent = new Map<string, Record<string, { status: string; value: string | null }>>();
  for (const c of built.cells) {
    const row = byStudent.get(c.studentKey) ?? {};
    row[c.assessmentId] = { status: c.status, value: c.score ?? c.textValue };
    byStudent.set(c.studentKey, row);
  }
  for (const key of built.invalidCellKeys) {
    const [studentKey, assessmentId] = key.split("|");
    const row = byStudent.get(studentKey) ?? {};
    row[assessmentId] = { status: "INVALID", value: null };
    byStudent.set(studentKey, row);
  }
  return {
    ok: !built.structuralErrors,
    problems,
    preview: {
      structuralErrors: built.structuralErrors,
      studentCount: built.roster.length,
      rowsRead: built.rowsRead,
      issues: built.issues.slice(0, 200),
      issueCount: built.issues.length,
      assessments,
      rows: built.roster.slice(0, 100).map((s) => ({ key: s.key, email: s.email, studentId: s.studentId, name: s.name, portalAccess: !!s.email, cells: byStudent.get(s.key) ?? {} })),
    },
  };
}

/** Saves the mapping atomically. Removed assessments are archived (their history is kept). */
export async function saveMapping(viewer: Viewer, offeringId: unknown, raw: unknown) {
  const { offering } = await requireEditableOffering(viewer, offeringId);
  const payload = parseInput(mappingSchema, raw);
  const source = await loadSourceForMapping(offering.id);
  const worksheetIdBySheet = new Map(source.worksheets.map((w) => [w.googleSheetId, w.id]));
  for (const w of payload.worksheets) {
    if (!worksheetIdBySheet.has(w.googleSheetId)) throw new AppError("VALIDATION", "A worksheet in the request isn't part of this spreadsheet. Refresh and try again.");
  }
  const live = await readLiveHeaders(source.spreadsheetId, payload);
  const problems = validatePayload(payload, worksheetIdBySheet, live);
  const errors = problems.filter((p) => p.severity === "error");
  if (errors.length) {
    throw new AppError("VALIDATION", errors.map((e) => e.message).join("\n"));
  }
  const warnings = problems.filter((p) => p.severity === "warning");
  if (warnings.length && !payload.acknowledgeWarnings) {
    return { saved: false as const, warnings: warnings.map((w) => w.message) };
  }

  await db.$transaction(
    async (tx) => {
      // Worksheets: clear roster flags first so the partial unique index never conflicts.
      await tx.sheetWorksheet.updateMany({ where: { sourceId: source.id }, data: { isRoster: false } });
      for (const w of payload.worksheets) {
        await tx.sheetWorksheet.update({
          where: { id: worksheetIdBySheet.get(w.googleSheetId)! },
          data: {
            enabled: w.enabled,
            isRoster: w.enabled && w.isRoster,
            headerRow: w.headerRow,
            headerRows: w.headerRows,
            dataStartRow: w.dataStartRow,
            studentIdHeader: w.studentIdHeader,
            emailHeader: w.emailHeader,
            nameHeader: w.nameHeader,
            title: live.get(w.googleSheetId)?.title ?? undefined,
          },
        });
      }

      // Groups in order of first appearance.
      const groupNames = [...new Set(payload.assessments.map((a) => a.groupName))];
      const groupIds = new Map<string, string>();
      for (const [i, name] of groupNames.entries()) {
        const g = await tx.assessmentGroup.upsert({
          where: { offeringId_name: { offeringId: offering.id, name } },
          update: { displayOrder: i },
          create: { offeringId: offering.id, name, displayOrder: i },
        });
        groupIds.set(name, g.id);
      }

      const existing = await tx.assessment.findMany({ where: { offeringId: offering.id } });
      const byId = new Map(existing.map((a) => [a.id, a]));
      for (const a of payload.assessments) {
        if (a.id && !byId.has(a.id)) throw new AppError("VALIDATION", "An assessment in the request doesn't belong to this course.");
      }
      // Resolve which existing row each payload assessment uses: its explicit id, or else an
      // existing assessment with the same name that isn't claimed by id (e.g. removed and re-added
      // from a renamed column, or previously archived). Reusing it keeps one stable assessment
      // and its history instead of creating a duplicate.
      const claimed = new Set(payload.assessments.map((a) => a.id).filter((x): x is string => !!x));
      const reusableByName = new Map(existing.filter((a) => !claimed.has(a.id)).map((a) => [a.name.trim().toLowerCase(), a]));
      const targetIds = payload.assessments.map((a) => {
        if (a.id) return a.id;
        const reuse = reusableByName.get(a.name.trim().toLowerCase());
        if (reuse) reusableByName.delete(a.name.trim().toLowerCase());
        return reuse?.id ?? null;
      });
      const kept = new Set(targetIds.filter((x): x is string => !!x));
      // Temporarily rename rows we will touch so renames/swaps can't violate the unique name index.
      for (const id of kept) await tx.assessment.update({ where: { id }, data: { name: `__tmp__${id}` } });
      // Archive active assessments that were removed from the mapping (marks are preserved).
      await tx.assessment.updateMany({
        where: { offeringId: offering.id, archivedAt: null, id: { notIn: [...kept] } },
        data: { archivedAt: new Date() },
      });
      // Drop all column mappings; they're recreated below.
      await tx.assessmentColumn.deleteMany({ where: { assessment: { offeringId: offering.id } } });

      for (const [i, a] of payload.assessments.entries()) {
        const data = {
          name: a.name,
          groupId: groupIds.get(a.groupName)!,
          valueType: a.valueType,
          kind: a.kind,
          maxScore: a.maxScore,
          threshold: a.threshold,
          displayOrder: i,
          archivedAt: null,
        };
        const id = targetIds[i];
        const row = id
          ? await tx.assessment.update({ where: { id }, data })
          : await tx.assessment.create({ data: { ...data, offeringId: offering.id } });
        if (a.columns.length) {
          await tx.assessmentColumn.createMany({
            data: a.columns.map((c) => ({
              assessmentId: row.id,
              worksheetId: worksheetIdBySheet.get(c.googleSheetId)!,
              header: cleanHeader(c.header),
              normalizedHeader: normalizeHeader(c.header),
              lastColumnIndex: (live.get(c.googleSheetId)?.headers ?? []).findIndex((h) => normalizeHeader(h) === normalizeHeader(c.header)),
            })),
          });
        }
      }
      // Remove empty groups that no assessment (active or archived) references.
      await tx.assessmentGroup.deleteMany({ where: { offeringId: offering.id, assessments: { none: {} } } });
      await recordAudit(tx, {
        actorId: viewer.profileId,
        action: "mapping.saved",
        entityType: "offering",
        entityId: offering.id,
        offeringId: offering.id,
        metadata: { worksheets: payload.worksheets.filter((w) => w.enabled).length, assessments: payload.assessments.length, warningsAcknowledged: warnings.length },
      });
    },
    { timeout: 20_000 },
  );
  return { saved: true as const, warnings: warnings.map((w) => w.message) };
}

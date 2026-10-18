import { cleanHeader, columnLetter, emailDomain, normalizeEmail, normalizeHeader, normalizeName, normalizeStudentId } from "@/lib/normalize";
import { combinedHeaders, detectDataStartRow, headerRowsLabel, rowAfterHeaders } from "@/lib/sheet-layout";
import type { ValueTypeName } from "@/lib/value-types";
import type { Grid, SpreadsheetMeta } from "../sheets/types";
import { parseCell, type MarkStatusValue } from "./cell";

/**
 * Pure transformation: mapping configuration + spreadsheet contents → validated class snapshot.
 * No I/O. Used by both "Preview" (nothing written) and the sync engine.
 *
 * Structural problems (missing worksheets/columns, duplicated headers, no roster) make the whole
 * snapshot unusable: the engine then keeps the last valid data untouched. Row/cell problems are
 * recorded with worksheet, row and column context; affected cells keep their previous value.
 */

export type IssueSeverity = "ERROR" | "WARNING" | "INFO";
export type Issue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  worksheetTitle?: string;
  rowNumber?: number;
  columnHeader?: string;
  /** Structural issues block the whole sync. */
  structural?: boolean;
};

export type WorksheetConfig = {
  id: string;
  googleSheetId: number;
  title: string;
  enabled: boolean;
  isRoster: boolean;
  headerRow: number;
  /** Consecutive rows (from headerRow) whose titles are combined, e.g. "Quiz" over "Q1". */
  headerRows: number;
  /** 1-based first student row; null = automatic (skip "max marks"-style rows after the titles). */
  dataStartRow: number | null;
  studentIdHeader: string | null;
  emailHeader: string | null;
  nameHeader: string | null;
  knownHeaders: string[];
};

export type AssessmentConfig = {
  id: string;
  name: string;
  valueType: ValueTypeName;
  maxScore: string | null;
  columns: Array<{ id: string; worksheetId: string; header: string; normalizedHeader: string; lastColumnIndex: number | null }>;
};

export type SyncConfig = {
  worksheets: WorksheetConfig[];
  assessments: AssessmentConfig[];
  studentDomains: string[];
};

export type ResolvedWorksheet = { config: WorksheetConfig; currentTitle: string };

/** `email` is null for students without an official student email (synced, but no portal access). */
export type RosterStudent = { key: string; email: string | null; studentId: string | null; name: string | null; row: number };

export type CellResult = {
  studentKey: string;
  assessmentId: string;
  status: MarkStatusValue;
  score: string | null;
  textValue: string | null;
  raw: string | null;
};

export type BuildOutput = {
  structuralErrors: boolean;
  issues: Issue[];
  roster: RosterStudent[];
  cells: CellResult[];
  /** `${studentKey}|${assessmentId}` whose source value was rejected; previous value is kept. */
  invalidCellKeys: Set<string>;
  worksheetUpdates: Array<{ worksheetId: string; title: string; knownHeaders: string[] }>;
  columnUpdates: Array<{ columnId: string; index: number }>;
  rowsRead: number;
};

export const cellKey = (studentKey: string, assessmentId: string) => `${studentKey}|${assessmentId}`;

/** Worksheets that must be read: the roster plus every enabled worksheet that feeds an assessment. */
export function requiredWorksheets(config: SyncConfig): WorksheetConfig[] {
  const used = new Set(config.assessments.flatMap((a) => a.columns.map((c) => c.worksheetId)));
  return config.worksheets.filter((w) => w.isRoster || used.has(w.id));
}

/** Resolve configured worksheets against live metadata using the stable sheetId. */
export function resolveWorksheets(config: SyncConfig, meta: SpreadsheetMeta): { resolved: ResolvedWorksheet[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const resolved: ResolvedWorksheet[] = [];
  const roster = config.worksheets.filter((w) => w.isRoster);
  if (roster.length !== 1) {
    issues.push({
      severity: "ERROR",
      code: "NO_ROSTER_WORKSHEET",
      structural: true,
      message: "Choose exactly one worksheet that lists every student in the class (the roster).",
    });
  }
  for (const ws of requiredWorksheets(config)) {
    if (!ws.enabled) {
      issues.push({
        severity: "ERROR",
        code: "WORKSHEET_DISABLED",
        structural: true,
        worksheetTitle: ws.title,
        message: `Worksheet "${ws.title}" is turned off but assessments still use it. Turn it back on or remove those mappings.`,
      });
      continue;
    }
    const live = meta.sheets.find((s) => s.sheetId === ws.googleSheetId);
    if (!live) {
      issues.push({
        severity: "ERROR",
        code: "WORKSHEET_MISSING",
        structural: true,
        worksheetTitle: ws.title,
        message: `Worksheet "${ws.title}" no longer exists in the spreadsheet. Restore it or update the configuration.`,
      });
      continue;
    }
    if (live.sheetType !== "GRID") {
      issues.push({
        severity: "ERROR",
        code: "WORKSHEET_NOT_GRID",
        structural: true,
        worksheetTitle: live.title,
        message: `"${live.title}" is not a normal worksheet (for example, a chart sheet) and can't be read.`,
      });
      continue;
    }
    if (live.title !== ws.title) {
      issues.push({
        severity: "INFO",
        code: "WORKSHEET_RENAMED",
        worksheetTitle: live.title,
        message: `Worksheet "${ws.title}" was renamed to "${live.title}". SyncScore followed the rename automatically.`,
      });
    }
    resolved.push({ config: ws, currentTitle: live.title });
  }
  return { resolved, issues };
}

type HeaderIndex = { headers: string[]; byNormalized: Map<string, number[]> };

export function indexHeaders(row: readonly unknown[] | undefined): HeaderIndex {
  const headers = (row ?? []).map(cleanHeader);
  const byNormalized = new Map<string, number[]>();
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (!key) return;
    byNormalized.set(key, [...(byNormalized.get(key) ?? []), i]);
  });
  return { headers, byNormalized };
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

type ParsedSheet = {
  ws: ResolvedWorksheet;
  grid: Grid;
  header: HeaderIndex;
  emailCol: number | null;
  idCol: number | null;
  nameCol: number | null;
  /** 1-based row where student data starts. */
  dataStart: number;
  /** Normalized title text per identity column, to recognize repeated title rows. */
  identityTitles: Map<number, Set<string>>;
  /** Columns that feed assessments (filled after columns are located). */
  markCols: number[];
  /** studentKey → row values */
  rows: Map<string, { values: unknown[]; rowNumber: number }>;
  /** Students whose rows in this worksheet are ambiguous (duplicated). */
  conflicted: Set<string>;
};

function locate(
  header: HeaderIndex,
  wanted: string | null,
  ws: ResolvedWorksheet,
  label: string,
  issues: Issue[],
  required: boolean,
): number | null {
  if (!wanted) return null;
  const idx = header.byNormalized.get(normalizeHeader(wanted)) ?? [];
  if (idx.length === 0) {
    issues.push({
      severity: required ? "ERROR" : "WARNING",
      code: "IDENTITY_COLUMN_MISSING",
      structural: required,
      worksheetTitle: ws.currentTitle,
      columnHeader: wanted,
      message: `The ${label} column "${wanted}" was not found in ${headerRowsLabel(ws.config.headerRow, ws.config.headerRows)} of "${ws.currentTitle}".`,
    });
    return null;
  }
  if (idx.length > 1) {
    issues.push({
      severity: "ERROR",
      code: "DUPLICATE_HEADER",
      structural: true,
      worksheetTitle: ws.currentTitle,
      columnHeader: wanted,
      message: `"${wanted}" appears in ${idx.length} columns (${idx.map(columnLetter).join(", ")}) of "${ws.currentTitle}". Rename one so SyncScore knows which to use.`,
    });
    return null;
  }
  return idx[0];
}

export function buildSnapshot(
  config: SyncConfig,
  resolution: { resolved: ResolvedWorksheet[]; issues: Issue[] },
  grids: Map<string, Grid>,
): BuildOutput {
  const { resolved } = resolution;
  const issues: Issue[] = [...resolution.issues];
  const worksheetUpdates: BuildOutput["worksheetUpdates"] = [];
  const columnUpdates: BuildOutput["columnUpdates"] = [];
  let rowsRead = 0;

  const rosterWs = resolved.find((r) => r.config.isRoster);
  const parsed = new Map<string, ParsedSheet>();
  const mappedByWorksheet = new Map<string, Set<string>>();
  for (const a of config.assessments) {
    for (const c of a.columns) {
      mappedByWorksheet.set(c.worksheetId, (mappedByWorksheet.get(c.worksheetId) ?? new Set()).add(c.normalizedHeader));
    }
  }

  // 1. Headers and identity columns for every resolved worksheet.
  for (const ws of resolved) {
    const grid = grids.get(ws.config.id) ?? [];
    const titles = combinedHeaders(grid, ws.config.headerRow, ws.config.headerRows);
    const titleLabel = headerRowsLabel(ws.config.headerRow, ws.config.headerRows);
    if (grid.length < ws.config.headerRow || titles.every((t) => !t)) {
      issues.push({
        severity: "ERROR",
        code: grid.length === 0 ? "WORKSHEET_EMPTY" : "HEADER_ROW_EMPTY",
        structural: true,
        worksheetTitle: ws.currentTitle,
        message:
          grid.length === 0
            ? `Worksheet "${ws.currentTitle}" is empty.`
            : `The header ${titleLabel} of "${ws.currentTitle}" ${ws.config.headerRows > 1 ? "are" : "is"} empty.`,
      });
      continue;
    }
    const header = indexHeaders(titles);
    const isRoster = ws.config.isRoster;
    if (isRoster && !ws.config.emailHeader) {
      issues.push({
        severity: "ERROR",
        code: "ROSTER_EMAIL_REQUIRED",
        structural: true,
        worksheetTitle: ws.currentTitle,
        message: `The roster worksheet "${ws.currentTitle}" needs a student email column so students can be matched to their accounts.`,
      });
    }
    if (!isRoster && !ws.config.emailHeader && !ws.config.studentIdHeader) {
      issues.push({
        severity: "ERROR",
        code: "IDENTITY_COLUMNS_REQUIRED",
        structural: true,
        worksheetTitle: ws.currentTitle,
        message: `Choose the student ID or email column for "${ws.currentTitle}".`,
      });
    }
    const emailCol = locate(header, ws.config.emailHeader, ws, "email", issues, true);
    const idCol = locate(header, ws.config.studentIdHeader, ws, "student ID", issues, true);
    const nameCol = locate(header, ws.config.nameHeader, ws, "name", issues, false);

    const known = new Set(ws.config.knownHeaders);
    const identity = new Set([ws.config.emailHeader, ws.config.studentIdHeader, ws.config.nameHeader].filter(Boolean).map((h) => normalizeHeader(h)));
    const mapped = mappedByWorksheet.get(ws.config.id) ?? new Set<string>();
    const normalizedHeaders = [...header.byNormalized.keys()];
    if (known.size > 0) {
      for (const h of normalizedHeaders) {
        if (!known.has(h) && !identity.has(h) && !mapped.has(h)) {
          const display = header.headers[header.byNormalized.get(h)![0]];
          issues.push({
            severity: "INFO",
            code: "NEW_COLUMN",
            worksheetTitle: ws.currentTitle,
            columnHeader: display,
            message: `New column "${display}" was found in "${ws.currentTitle}". It stays hidden from students until you map it to an assessment.`,
          });
        }
      }
    }
    worksheetUpdates.push({ worksheetId: ws.config.id, title: ws.currentTitle, knownHeaders: normalizedHeaders });

    const afterTitles = rowAfterHeaders(ws.config.headerRow, ws.config.headerRows);
    let dataStart = ws.config.dataStartRow ?? detectDataStartRow(grid, ws.config, { idCol, emailCol });
    if (dataStart < afterTitles) dataStart = afterTitles;
    if (ws.config.dataStartRow === null && dataStart > afterTitles) {
      const skipped = Array.from({ length: dataStart - afterTitles }, (_, i) => afterTitles + i);
      issues.push({
        severity: "INFO",
        code: "HEADER_ROWS_SKIPPED",
        worksheetTitle: ws.currentTitle,
        rowNumber: afterTitles,
        message: `Row${skipped.length > 1 ? "s" : ""} ${formatRows(skipped)} of "${ws.currentTitle}" ${skipped.length > 1 ? "have" : "has"} no student ID or email, so ${skipped.length > 1 ? "they were" : "it was"} treated as part of the column titles (for example, a maximum-marks row). Student data starts at row ${dataStart}.`,
      });
    }
    const identityTitles = new Map<number, Set<string>>();
    for (const col of [emailCol, idCol, nameCol]) {
      if (col === null) continue;
      const parts = new Set([normalizeHeader(titles[col])]);
      for (let r = ws.config.headerRow; r < afterTitles; r++) parts.add(normalizeHeader(grid[r - 1]?.[col]));
      parts.delete("");
      identityTitles.set(col, parts);
    }
    parsed.set(ws.config.id, { ws, grid, header, emailCol, idCol, nameCol, dataStart, identityTitles, markCols: [], rows: new Map(), conflicted: new Set() });
  }

  // 2. Assessment columns: locate by header text (columns may have moved).
  const columnIndex = new Map<string, number>(); // AssessmentColumn.id → index
  for (const a of config.assessments) {
    for (const c of a.columns) {
      const p = parsed.get(c.worksheetId);
      if (!p) continue; // worksheet missing/disabled/empty already reported
      const idx = p.header.byNormalized.get(c.normalizedHeader) ?? [];
      if (idx.length === 0) {
        issues.push({
          severity: "ERROR",
          code: "COLUMN_NOT_FOUND",
          structural: true,
          worksheetTitle: p.ws.currentTitle,
          columnHeader: c.header,
          message: `Column "${c.header}" (assessment "${a.name}") was not found in "${p.ws.currentTitle}". If it was renamed, update the mapping so SyncScore doesn't guess.`,
        });
        continue;
      }
      if (idx.length > 1) {
        issues.push({
          severity: "ERROR",
          code: "DUPLICATE_HEADER",
          structural: true,
          worksheetTitle: p.ws.currentTitle,
          columnHeader: c.header,
          message: `"${c.header}" appears in ${idx.length} columns (${idx.map(columnLetter).join(", ")}) of "${p.ws.currentTitle}". Rename one so SyncScore knows which to use.`,
        });
        continue;
      }
      if (c.lastColumnIndex !== null && c.lastColumnIndex !== idx[0]) {
        issues.push({
          severity: "INFO",
          code: "COLUMN_MOVED",
          worksheetTitle: p.ws.currentTitle,
          columnHeader: c.header,
          message: `Column "${c.header}" moved from ${columnLetter(c.lastColumnIndex)} to ${columnLetter(idx[0])}. SyncScore followed it by its header.`,
        });
      }
      columnIndex.set(c.id, idx[0]);
      p.markCols.push(idx[0]);
      columnUpdates.push({ columnId: c.id, index: idx[0] });
    }
  }

  const empty = (): BuildOutput => ({
    structuralErrors: true,
    issues,
    roster: [],
    cells: [],
    invalidCellKeys: new Set(),
    worksheetUpdates,
    columnUpdates,
    rowsRead,
  });

  if (!rosterWs) {
    if (!issues.some((i) => i.structural)) {
      issues.push({ severity: "ERROR", code: "NO_ROSTER_WORKSHEET", structural: true, message: "No roster worksheet is configured." });
    }
    return empty();
  }
  if (issues.some((i) => i.structural)) return empty();

  // 3. Roster.
  const roster: RosterStudent[] = [];
  const byEmail = new Map<string, RosterStudent>();
  const byId = new Map<string, RosterStudent>();
  const rosterParsed = parsed.get(rosterWs.config.id)!;

  forEachDataRow(rosterParsed, issues, (values, rowNumber) => {
    rowsRead++;
    const rawEmail = rosterParsed.emailCol !== null ? values[rosterParsed.emailCol] : undefined;
    const rawId = rosterParsed.idCol !== null ? values[rosterParsed.idCol] : undefined;
    const ctx = { worksheetTitle: rosterWs.currentTitle, rowNumber };

    let studentId: string | null = null;
    if (rosterParsed.idCol !== null && !isBlank(rawId)) {
      studentId = normalizeStudentId(rawId);
      if (!studentId) {
        issues.push({
          severity: "WARNING",
          code: "INVALID_STUDENT_ID",
          ...ctx,
          columnHeader: rosterWs.config.studentIdHeader ?? undefined,
          message: `Row ${rowNumber}: student ID "${String(rawId).slice(0, 40)}" isn't valid and was ignored.`,
        });
      }
    }

    // An official student email gives portal access. Without one (blank, "NA", personal or
    // invalid address) the student is still synced, identified by student ID, but can't sign in
    // to see their marks until the sheet has their university email.
    let email: string | null = null;
    let missingEmailReason: string | null = null;
    if (isBlank(rawEmail)) {
      missingEmailReason = "has no email";
    } else {
      const normalized = normalizeEmail(rawEmail);
      if (!normalized) missingEmailReason = `has "${String(rawEmail).trim().slice(0, 60)}" instead of an email`;
      else if (!config.studentDomains.includes(emailDomain(normalized))) missingEmailReason = `has ${normalized}, which isn't an official student email`;
      else email = normalized;
    }
    if (!email && !studentId) {
      issues.push({
        severity: "ERROR",
        code: "ROW_MISSING_IDENTITY",
        ...ctx,
        message: `Row ${rowNumber} ${missingEmailReason} and no student ID, so its marks can't be tracked. Add a student ID or a ${config.studentDomains.map((d) => "@" + d).join(" / ")} email. The row was skipped.`,
      });
      return;
    }

    if (email) {
      const existing = byEmail.get(email);
      if (existing) {
        rosterParsed.conflicted.add(existing.key);
        issues.push({
          severity: "ERROR",
          code: "DUPLICATE_STUDENT",
          ...ctx,
          message: `Row ${rowNumber} repeats the student in row ${existing.row} (${email}). Their marks from "${rosterWs.currentTitle}" were not updated until the duplicate is removed.`,
        });
        return;
      }
    }
    if (studentId) {
      const sameId = byId.get(studentId);
      if (sameId) {
        if (!email && !sameId.email) {
          rosterParsed.conflicted.add(sameId.key);
          issues.push({
            severity: "ERROR",
            code: "DUPLICATE_STUDENT",
            ...ctx,
            message: `Row ${rowNumber} repeats student ID ${studentId} from row ${sameId.row}. Their marks from "${rosterWs.currentTitle}" were not updated until the duplicate is removed.`,
          });
        } else {
          issues.push({
            severity: "ERROR",
            code: "DUPLICATE_STUDENT_ID",
            ...ctx,
            columnHeader: rosterWs.config.studentIdHeader ?? undefined,
            message: `Row ${rowNumber}: student ID ${studentId} is also used by row ${sameId.row} with a different email. The row was skipped.`,
          });
        }
        return;
      }
    }

    const name = rosterParsed.nameCol !== null ? normalizeName(values[rosterParsed.nameCol]) : null;
    if (!email) {
      issues.push({
        severity: "WARNING",
        code: "NO_PORTAL_EMAIL",
        ...ctx,
        columnHeader: rosterWs.config.emailHeader ?? undefined,
        message: `Row ${rowNumber} (${name ?? `ID ${studentId}`}) ${missingEmailReason}. Their marks are synced, but they can't view them in SyncScore until their official ${config.studentDomains.map((d) => "@" + d).join(" / ")} email is added to the sheet.`,
      });
    }
    const student: RosterStudent = { key: email ?? `id:${studentId}`, email, studentId, name, row: rowNumber };
    roster.push(student);
    if (email) byEmail.set(email, student);
    if (studentId) byId.set(studentId, student);
    rosterParsed.rows.set(student.key, { values, rowNumber });
  });

  // 4. Other worksheets: match rows to roster students.
  for (const p of parsed.values()) {
    if (p.ws.config.isRoster) continue;
    const seen = new Map<string, number>();
    forEachDataRow(p, issues, (values, rowNumber) => {
      rowsRead++;
      const ctx = { worksheetTitle: p.ws.currentTitle, rowNumber };
      const rawEmail = p.emailCol !== null ? values[p.emailCol] : undefined;
      const rawId = p.idCol !== null ? values[p.idCol] : undefined;
      const email = isBlank(rawEmail) ? null : normalizeEmail(rawEmail);
      const sid = isBlank(rawId) ? null : normalizeStudentId(rawId);
      const byE = email ? byEmail.get(email) : undefined;
      const byI = sid ? byId.get(sid) : undefined;
      if (byE && byI && byE.key !== byI.key) {
        issues.push({
          severity: "ERROR",
          code: "IDENTITY_MISMATCH",
          ...ctx,
          message: `Row ${rowNumber}: the email and student ID belong to different students in the roster. The row was skipped.`,
        });
        return;
      }
      const student = byE ?? byI;
      if (!student) {
        const hasIdentity = !isBlank(rawEmail) || !isBlank(rawId);
        issues.push({
          severity: "ERROR",
          code: hasIdentity ? "STUDENT_NOT_IN_ROSTER" : "ROW_MISSING_IDENTITY",
          ...ctx,
          message: hasIdentity
            ? `Row ${rowNumber}: ${String(!isBlank(rawId) ? rawId : rawEmail).slice(0, 80)} is not in the roster worksheet "${rosterWs.currentTitle}". The row was skipped.`
            : `Row ${rowNumber} has marks but no student ID or email. The row was skipped.`,
        });
        return;
      }
      const prior = seen.get(student.key);
      if (prior !== undefined) {
        p.conflicted.add(student.key);
        issues.push({
          severity: "ERROR",
          code: "DUPLICATE_STUDENT",
          ...ctx,
          message: `Row ${rowNumber} repeats the student in row ${prior}. Their marks from "${p.ws.currentTitle}" were not updated until the duplicate is removed.`,
        });
        return;
      }
      seen.set(student.key, rowNumber);
      p.rows.set(student.key, { values, rowNumber });
    });
  }

  // 5. Cells: every roster student × every assessment.
  const cells: CellResult[] = [];
  const invalidCellKeys = new Set<string>();
  for (const a of config.assessments) {
    const rule = { valueType: a.valueType, maxScore: a.maxScore };
    for (const s of roster) {
      const found: Array<{ status: MarkStatusValue; score: string | null; textValue: string | null; raw: string | null; where: string }> = [];
      let invalid = false;
      for (const c of a.columns) {
        const p = parsed.get(c.worksheetId);
        const idx = columnIndex.get(c.id);
        if (!p || idx === undefined) continue;
        if (p.conflicted.has(s.key)) {
          invalid = true;
          continue;
        }
        const row = p.rows.get(s.key);
        if (!row) continue;
        const result = parseCell(row.values[idx], rule);
        if (!result.ok) {
          invalid = true;
          issues.push({
            severity: "ERROR",
            code: result.code,
            worksheetTitle: p.ws.currentTitle,
            rowNumber: row.rowNumber,
            columnHeader: c.header,
            message: `Row ${row.rowNumber}, column "${c.header}": ${result.message}`,
          });
          continue;
        }
        if (result.status !== "MISSING") found.push({ ...result, where: p.ws.currentTitle });
      }
      if (invalid) {
        invalidCellKeys.add(cellKey(s.key, a.id));
        continue;
      }
      if (found.length > 1) {
        invalidCellKeys.add(cellKey(s.key, a.id));
        issues.push({
          severity: "ERROR",
          code: "AMBIGUOUS_SPLIT_VALUE",
          columnHeader: a.name,
          message: `Assessment "${a.name}" has values for the student in roster row ${s.row} in more than one worksheet (${found.map((f) => f.where).join(", ")}). Keep only one.`,
        });
        continue;
      }
      const v = found[0];
      cells.push({
        studentKey: s.key,
        assessmentId: a.id,
        status: v?.status ?? "MISSING",
        score: v?.score ?? null,
        textValue: v?.textValue ?? null,
        raw: v?.raw ?? null,
      });
    }
  }

  return { structuralErrors: false, issues, roster, cells, invalidCellKeys, worksheetUpdates, columnUpdates, rowsRead };
}

function isZeroOrBlank(v: unknown): boolean {
  return isBlank(v) || v === 0 || (typeof v === "string" && /^\s*0+(\.0+)?\s*$/.test(v));
}

/**
 * Iterates student rows. Skips, without treating them as students:
 * - blank rows (reported when they sit between students),
 * - repeated title rows (identity cells equal their column titles, e.g. a merged "ID" title),
 * - template rows: no ID, email or name and no marks other than 0 (pre-numbered serials with
 *   formula totals). Reported when they sit between students; silent at the end of the sheet.
 */
function forEachDataRow(p: ParsedSheet, issues: Issue[], fn: (values: unknown[], rowNumber: number) => void) {
  const data = p.grid;
  const identityCols = [p.emailCol, p.idCol, p.nameCol].filter((c): c is number => c !== null);
  const blanks: number[] = [];
  const templates: number[] = [];
  for (let r = p.dataStart - 1; r < data.length; r++) {
    const values = data[r] ?? [];
    const rowNumber = r + 1;
    if (values.every(isBlank)) {
      blanks.push(rowNumber);
      continue;
    }
    if (identityCols.length && identityCols.every((c) => !isBlank(values[c]) && p.identityTitles.get(c)?.has(normalizeHeader(values[c])))) {
      continue;
    }
    if (identityCols.length && identityCols.every((c) => isBlank(values[c])) && p.markCols.every((c) => isZeroOrBlank(values[c]))) {
      templates.push(rowNumber);
      continue;
    }
    if (blanks.length) {
      issues.push({
        severity: "WARNING",
        code: "EMPTY_ROWS",
        worksheetTitle: p.ws.currentTitle,
        rowNumber: blanks[0],
        message: `Empty row${blanks.length > 1 ? "s" : ""} ${formatRows(blanks)} in "${p.ws.currentTitle}" ${blanks.length > 1 ? "were" : "was"} skipped. Remove ${blanks.length > 1 ? "them" : "it"} if ${blanks.length > 1 ? "they're" : "it's"} unintentional.`,
      });
      blanks.length = 0;
    }
    if (templates.length) {
      issues.push({
        severity: "WARNING",
        code: "UNFILLED_ROWS",
        worksheetTitle: p.ws.currentTitle,
        rowNumber: templates[0],
        message: `Row${templates.length > 1 ? "s" : ""} ${formatRows(templates)} in "${p.ws.currentTitle}" ${templates.length > 1 ? "have" : "has"} no student ID, email or name, so ${templates.length > 1 ? "they were" : "it was"} skipped. Fill in the student if ${templates.length > 1 ? "these rows belong" : "this row belongs"} to someone.`,
      });
      templates.length = 0;
    }
    fn(values, rowNumber);
  }
}

function formatRows(rows: number[]): string {
  return rows.length <= 5 ? rows.join(", ") : `${rows.slice(0, 5).join(", ")} and ${rows.length - 5} more`;
}

import { normalizeHeader } from "@/lib/normalize";
import { MAX_HEADER_ROWS } from "@/lib/sheet-layout";
import type { ValueTypeName } from "@/lib/value-types";

export const MAX_DATA_START_ROW = 100;

/**
 * Validates a faculty-submitted mapping configuration before it is saved. Returns field-level
 * problems (blocking) and ambiguity warnings (shown, require acknowledgement in the UI).
 */
export type MappingWorksheet = {
  id: string;
  title: string;
  enabled: boolean;
  isRoster: boolean;
  headerRow: number;
  /** Title rows combined into one header (default 1). */
  headerRows?: number;
  /** First student row; null/undefined = automatic. */
  dataStartRow?: number | null;
  studentIdHeader: string | null;
  emailHeader: string | null;
  nameHeader: string | null;
  /** Headers currently present in the header row (from the live spreadsheet). */
  availableHeaders: string[];
};

export type MappingAssessment = {
  key: string;
  name: string;
  groupName: string;
  valueType: ValueTypeName;
  maxScore: string | null;
  /** PERCENT only. */
  threshold?: string | null;
  columns: Array<{ worksheetId: string; header: string }>;
};

export type MappingProblem = { severity: "error" | "warning"; message: string; path?: string };

export function validateMapping(worksheets: MappingWorksheet[], assessments: MappingAssessment[]): MappingProblem[] {
  const problems: MappingProblem[] = [];
  const enabled = worksheets.filter((w) => w.enabled);
  const rosters = enabled.filter((w) => w.isRoster);
  if (rosters.length !== 1) {
    problems.push({ severity: "error", message: "Choose exactly one enabled worksheet as the class roster.", path: "roster" });
  }
  const byId = new Map(worksheets.map((w) => [w.id, w]));

  for (const w of enabled) {
    const available = new Set(w.availableHeaders.map(normalizeHeader));
    if (!Number.isInteger(w.headerRow) || w.headerRow < 1 || w.headerRow > 50) {
      problems.push({ severity: "error", message: `"${w.title}": header row must be between 1 and 50.`, path: `ws.${w.id}.headerRow` });
    }
    const headerRows = w.headerRows ?? 1;
    if (!Number.isInteger(headerRows) || headerRows < 1 || headerRows > MAX_HEADER_ROWS) {
      problems.push({ severity: "error", message: `"${w.title}": column titles can span 1 to ${MAX_HEADER_ROWS} rows.`, path: `ws.${w.id}.headerRows` });
    }
    if (w.dataStartRow !== null && w.dataStartRow !== undefined && (!Number.isInteger(w.dataStartRow) || w.dataStartRow < w.headerRow + headerRows || w.dataStartRow > MAX_DATA_START_ROW)) {
      problems.push({ severity: "error", message: `"${w.title}": student rows must start below the column titles (row ${w.headerRow + headerRows} or later).`, path: `ws.${w.id}.dataStartRow` });
    }
    if (w.isRoster && !w.emailHeader) {
      problems.push({ severity: "error", message: `"${w.title}": the roster needs a student email column.`, path: `ws.${w.id}.emailHeader` });
    }
    const usedByAssessments = assessments.some((a) => a.columns.some((c) => c.worksheetId === w.id));
    if (!w.isRoster && usedByAssessments && !w.emailHeader && !w.studentIdHeader) {
      problems.push({ severity: "error", message: `"${w.title}": choose a student ID or email column.`, path: `ws.${w.id}.identity` });
    }
    const identity = [w.emailHeader, w.studentIdHeader, w.nameHeader].filter((h): h is string => !!h);
    for (const h of identity) {
      if (!available.has(normalizeHeader(h))) {
        problems.push({ severity: "error", message: `"${w.title}": column "${h}" isn't in the header row.`, path: `ws.${w.id}.identity` });
      }
    }
    if (new Set(identity.map(normalizeHeader)).size !== identity.length) {
      problems.push({ severity: "error", message: `"${w.title}": the same column is used for more than one identity field.`, path: `ws.${w.id}.identity` });
    }
  }

  const names = new Map<string, string>();
  const columnOwners = new Map<string, string>();
  for (const a of assessments) {
    const label = a.name.trim() || "(unnamed)";
    const nameKey = a.name.trim().toLowerCase();
    if (!nameKey) problems.push({ severity: "error", message: "Every assessment needs a name.", path: `a.${a.key}.name` });
    else if (names.has(nameKey)) problems.push({ severity: "error", message: `Two assessments are named "${label}". Names must be unique.`, path: `a.${a.key}.name` });
    names.set(nameKey, a.key);
    if (!a.groupName.trim()) problems.push({ severity: "error", message: `"${label}": choose a category.`, path: `a.${a.key}.group` });
    if (a.valueType === "PERCENT") {
      const t = Number(a.threshold);
      if (a.threshold === null || a.threshold === undefined || a.threshold === "" || !Number.isFinite(t) || t < 0 || t > 100 || !/^\d+(\.\d{1,2})?$/.test(String(a.threshold))) {
        problems.push({ severity: "error", message: `"${label}": enter a threshold between 0 and 100 (for example 90).`, path: `a.${a.key}.threshold` });
      }
    }
    if (a.valueType === "NUMERIC") {
      const max = Number(a.maxScore);
      if (a.maxScore === null || a.maxScore === "" || !Number.isFinite(max) || max <= 0 || max > 100000) {
        problems.push({ severity: "error", message: `"${label}": enter a maximum mark greater than 0.`, path: `a.${a.key}.maxScore` });
      } else if (!/^\d+(\.\d{1,2})?$/.test(String(a.maxScore))) {
        problems.push({ severity: "error", message: `"${label}": maximum mark can have at most 2 decimal places.`, path: `a.${a.key}.maxScore` });
      }
    }
    if (a.columns.length === 0) problems.push({ severity: "error", message: `"${label}": choose at least one spreadsheet column.`, path: `a.${a.key}.columns` });
    const seenWs = new Set<string>();
    for (const c of a.columns) {
      const ws = byId.get(c.worksheetId);
      if (!ws) {
        problems.push({ severity: "error", message: `"${label}": unknown worksheet.`, path: `a.${a.key}.columns` });
        continue;
      }
      if (!ws.enabled) problems.push({ severity: "error", message: `"${label}": worksheet "${ws.title}" is turned off.`, path: `a.${a.key}.columns` });
      if (seenWs.has(ws.id)) {
        problems.push({ severity: "error", message: `"${label}": only one column per worksheet can feed an assessment.`, path: `a.${a.key}.columns` });
      }
      seenWs.add(ws.id);
      const norm = normalizeHeader(c.header);
      if (!ws.availableHeaders.map(normalizeHeader).includes(norm)) {
        problems.push({ severity: "error", message: `"${label}": column "${c.header}" isn't in "${ws.title}".`, path: `a.${a.key}.columns` });
      }
      if (ws.availableHeaders.map(normalizeHeader).filter((h) => h === norm).length > 1) {
        problems.push({ severity: "error", message: `"${label}": "${c.header}" appears more than once in "${ws.title}". Rename one of the columns first.`, path: `a.${a.key}.columns` });
      }
      if ([ws.emailHeader, ws.studentIdHeader, ws.nameHeader].some((h) => h && normalizeHeader(h) === norm)) {
        problems.push({ severity: "error", message: `"${label}": "${c.header}" is a student identity column, not marks.`, path: `a.${a.key}.columns` });
      }
      const ownerKey = `${ws.id}|${norm}`;
      const owner = columnOwners.get(ownerKey);
      if (owner && owner !== a.key) {
        problems.push({ severity: "error", message: `Column "${c.header}" in "${ws.title}" is mapped to more than one assessment.`, path: `a.${a.key}.columns` });
      }
      columnOwners.set(ownerKey, a.key);
    }
  }

  // Ambiguity: a header mapped in one worksheet also exists, unmapped, in another enabled worksheet.
  for (const a of assessments) {
    for (const c of a.columns) {
      const norm = normalizeHeader(c.header);
      const elsewhere = enabled.filter(
        (w) => w.id !== c.worksheetId && w.availableHeaders.map(normalizeHeader).includes(norm) && !columnOwners.has(`${w.id}|${norm}`),
      );
      if (elsewhere.length) {
        problems.push({
          severity: "warning",
          message: `"${c.header}" also appears in ${elsewhere.map((w) => `"${w.title}"`).join(", ")} but only the column in "${byId.get(c.worksheetId)?.title}" feeds "${a.name}". If marks are split across worksheets, add the other column to this assessment.`,
          path: `a.${a.key}.columns`,
        });
      }
    }
  }
  return problems;
}

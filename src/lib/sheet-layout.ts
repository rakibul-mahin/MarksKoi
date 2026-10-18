import { cleanHeader, normalizeEmail, normalizeHeader, normalizeStudentId } from "@/lib/normalize";

/**
 * Pure helpers for reading real-world gradebook layouts: merged cells, column titles spread over
 * several rows ("Quiz" above "Q1 | Q2"), and rows such as "max marks" that sit between the titles
 * and the first student. Shared by the mapping editor (client) and the sync builder (server).
 */

/** 0-based, end-exclusive, as returned by the Sheets API `merges` field. */
export type MergeRange = { startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number };

export const MAX_HEADER_ROWS = 5;
/** Automatic data-start detection never skips more rows than this after the titles. */
export const MAX_AUTO_SKIPPED_ROWS = 10;
export const HEADER_JOINER = " › ";

function blank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/**
 * Google returns a merged range's value only in its top-left cell. Copy it into every cell of the
 * range so a vertically merged "Student ID" title, a "Quiz" title spanning several columns, or a
 * group mark merged across team members reads the same as if the cells were not merged.
 * Rows beyond the grid are not created (they would hold nothing but the merged value).
 */
export function fillMerges<T>(grid: T[][], merges: MergeRange[] | undefined): T[][] {
  if (!merges?.length) return grid;
  const out = grid.map((r) => [...r]);
  for (const m of merges) {
    const value = out[m.startRowIndex]?.[m.startColumnIndex];
    if (blank(value)) continue;
    const endRow = Math.min(m.endRowIndex, out.length);
    for (let r = m.startRowIndex; r < endRow; r++) {
      const row = out[r];
      for (let c = m.startColumnIndex; c < m.endColumnIndex; c++) {
        while (row.length < c) row.push(null as T);
        if (blank(row[c])) row[c] = value;
      }
    }
  }
  return out;
}

/**
 * Column titles from `headerRows` consecutive rows starting at `headerRow` (1-based), joined per
 * column: "Quiz" over "Q1" → "Quiz › Q1". Repeated parts (from vertical merges) appear once.
 * Blank columns stay "" so positions equal real column indexes.
 */
export function combinedHeaders(grid: readonly (readonly unknown[])[], headerRow: number, headerRows = 1): string[] {
  const rows = grid.slice(headerRow - 1, headerRow - 1 + Math.max(1, headerRows));
  const width = Math.max(0, ...rows.map((r) => r.length));
  return Array.from({ length: width }, (_, c) => {
    const parts: string[] = [];
    for (const r of rows) {
      const part = cleanHeader(r[c]);
      if (part && normalizeHeader(part) !== normalizeHeader(parts[parts.length - 1] ?? "")) parts.push(part);
    }
    return parts.join(HEADER_JOINER);
  });
}

/** "row 3" or "rows 3–4". */
export function headerRowsLabel(headerRow: number, headerRows = 1): string {
  return headerRows > 1 ? `rows ${headerRow}–${headerRow + headerRows - 1}` : `row ${headerRow}`;
}

/** 1-based row just below the column titles. */
export function rowAfterHeaders(headerRow: number, headerRows = 1): number {
  return headerRow + Math.max(1, headerRows);
}

/** A row whose ID or email cell holds a plausible student identity (an ID needs a digit). */
export function looksLikeStudentRow(values: readonly unknown[], cols: { idCol: number | null; emailCol: number | null }): boolean {
  if (cols.emailCol !== null && normalizeEmail(values[cols.emailCol])) return true;
  if (cols.idCol !== null) {
    const id = normalizeStudentId(values[cols.idCol]);
    if (id && /\d/.test(id)) return true;
  }
  return false;
}

/**
 * Automatic start of student data (1-based): rows right below the titles with no student ID or
 * email (a "max marks" row, weights, a second title row) are treated as part of the header.
 * Falls back to the row after the titles when no student row is found nearby.
 */
export function detectDataStartRow(
  grid: readonly (readonly unknown[])[],
  layout: { headerRow: number; headerRows?: number },
  cols: { idCol: number | null; emailCol: number | null },
): number {
  const first = rowAfterHeaders(layout.headerRow, layout.headerRows);
  if (cols.idCol === null && cols.emailCol === null) return first;
  const last = Math.min(grid.length, first + MAX_AUTO_SKIPPED_ROWS);
  for (let row = first; row <= last; row++) {
    if (looksLikeStudentRow(grid[row - 1] ?? [], cols)) return row;
  }
  return first;
}

/** First numeric value in `col` between the titles and the first student row ("max marks" row). */
export function maxMarkHint(grid: readonly (readonly unknown[])[], from: number, to: number, col: number): string {
  for (let row = from; row < to; row++) {
    const v = grid[row - 1]?.[col];
    const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return String(Math.round(n * 100) / 100);
  }
  return "";
}

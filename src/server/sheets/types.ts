/**
 * Google Sheets integration boundary. The rest of the application depends only on this
 * interface; the Google REST implementation and the local fixture implementation live behind it.
 */
export type WorksheetMeta = {
  /** Stable numeric id (gid). Survives renames and reordering. */
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
  /** GRID for normal sheets; OBJECT for chart sheets (not readable as values). */
  sheetType: string;
};

export type SpreadsheetMeta = {
  spreadsheetId: string;
  title: string;
  sheets: WorksheetMeta[];
};

/** Cell values as returned with valueRenderOption=UNFORMATTED_VALUE. */
export type CellValue = string | number | boolean | null;
export type Grid = CellValue[][];

/** `maxRows`: read only the top rows (titles + samples) instead of the whole worksheet. */
export type ReadOptions = { maxRows?: number };

export interface SheetsClient {
  getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetMeta>;
  /**
   * Returns one grid per requested worksheet title, in order. Merged ranges are expanded: every
   * cell of a merge carries the merge's value (Google itself only returns it in the top-left cell).
   */
  getWorksheetValues(spreadsheetId: string, titles: string[], opts?: ReadOptions): Promise<Grid[]>;
}

export type SheetsErrorCode =
  | "NOT_SHARED"
  | "NOT_FOUND"
  | "UNSUPPORTED_DOCUMENT"
  | "API_DISABLED"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_REQUEST"
  | "CONFIG";

const RETRYABLE: ReadonlySet<SheetsErrorCode> = new Set(["RATE_LIMITED", "UNAVAILABLE", "TIMEOUT"]);

export class SheetsError extends Error {
  readonly code: SheetsErrorCode;
  readonly status?: number;
  constructor(code: SheetsErrorCode, message: string, opts?: { status?: number; cause?: unknown }) {
    super(message, { cause: opts?.cause });
    this.name = "SheetsError";
    this.code = code;
    this.status = opts?.status;
  }
  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

/** Faculty-facing explanations with a suggested fix. */
export function describeSheetsError(code: SheetsErrorCode, serviceAccountEmail: string | null): string {
  const sa = serviceAccountEmail ?? "the SyncScore service account";
  switch (code) {
    case "NOT_SHARED":
      return `SyncScore can't open this spreadsheet. Share it with ${sa} (Viewer access is enough) and try again.`;
    case "NOT_FOUND":
      return "We couldn't find a spreadsheet with that link. Check that the URL is correct and the file hasn't been deleted.";
    case "UNSUPPORTED_DOCUMENT":
      return "This file isn't a Google Sheets spreadsheet (for example, an uploaded Excel file). Open it in Google Sheets and use File → Save as Google Sheets, then use the new link.";
    case "API_DISABLED":
      return "The Google Sheets API isn't enabled for SyncScore's Google Cloud project. An administrator needs to enable it.";
    case "AUTH_FAILED":
      return "SyncScore's Google credentials were rejected. An administrator needs to check the service-account configuration.";
    case "RATE_LIMITED":
      return "Google is temporarily limiting requests. Please wait a minute and try again.";
    case "UNAVAILABLE":
    case "TIMEOUT":
      return "Google Sheets didn't respond in time. Your previously synced results are unchanged. Please try again shortly.";
    case "INVALID_REQUEST":
      return "Google Sheets rejected the request. Check that the configured worksheets still exist.";
    case "CONFIG":
      return "Google Sheets access isn't configured on this server. An administrator needs to add the service-account credentials.";
  }
}

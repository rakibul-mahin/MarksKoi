import { readFileSync } from "node:fs";
import { fillMerges, type MergeRange } from "@/lib/sheet-layout";
import { SheetsError, type Grid, type ReadOptions, type SheetsClient, type SheetsErrorCode, type SpreadsheetMeta } from "./types";

/**
 * Local development / automated-test implementation that reads spreadsheets from a JSON file.
 * The file is re-read on every call so tests can change "the spreadsheet" between steps.
 * Refused in production by `getSheetsConfig()`.
 *
 * File shape:
 * { "<spreadsheetId>": { "title": "...", "shared": true, "failure"?: "TIMEOUT",
 *     "sheets": [ { "sheetId": 0, "title": "Roster", "values": [["Student ID", ...], ...],
 *                   "merges"?: [{ "startRowIndex": 0, "endRowIndex": 2, "startColumnIndex": 0, "endColumnIndex": 1 }] } ] } }
 */
export type FixtureSpreadsheet = {
  title: string;
  shared?: boolean;
  failure?: SheetsErrorCode;
  sheets: Array<{ sheetId: number; title: string; values: Grid; merges?: MergeRange[] }>;
};
export type FixtureFile = Record<string, FixtureSpreadsheet>;

export class FixtureSheetsClient implements SheetsClient {
  constructor(private readonly source: string | (() => FixtureFile)) {}

  private load(spreadsheetId: string): FixtureSpreadsheet {
    let file: FixtureFile;
    if (typeof this.source === "function") {
      file = this.source();
    } else {
      try {
        file = JSON.parse(readFileSync(this.source, "utf8")) as FixtureFile;
      } catch (err) {
        throw new SheetsError("CONFIG", "Sheets fixture file could not be read.", { cause: err });
      }
    }
    const sheet = Object.prototype.hasOwnProperty.call(file, spreadsheetId) ? file[spreadsheetId] : undefined;
    if (!sheet) throw new SheetsError("NOT_FOUND", "Spreadsheet not found in fixture.", { status: 404 });
    if (sheet.failure) throw new SheetsError(sheet.failure, `Simulated failure: ${sheet.failure}`);
    if (sheet.shared === false) throw new SheetsError("NOT_SHARED", "Spreadsheet not shared (fixture).", { status: 403 });
    return sheet;
  }

  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetMeta> {
    const s = this.load(spreadsheetId);
    return {
      spreadsheetId,
      title: s.title,
      sheets: s.sheets.map((ws, index) => ({
        sheetId: ws.sheetId,
        title: ws.title,
        index,
        sheetType: "GRID",
        rowCount: Math.max(ws.values.length, 1000),
        columnCount: Math.max(...ws.values.map((r) => r.length), 26),
      })),
    };
  }

  async getWorksheetValues(spreadsheetId: string, titles: string[], opts: ReadOptions = {}): Promise<Grid[]> {
    const s = this.load(spreadsheetId);
    return titles.map((title) => {
      const ws = s.sheets.find((w) => w.title === title);
      if (!ws) throw new SheetsError("INVALID_REQUEST", `Unable to parse range: ${title}`, { status: 400 });
      // Mimic the API: trailing empty cells/rows are trimmed.
      const filled = fillMerges(ws.values, ws.merges);
      const rows = (opts.maxRows ? filled.slice(0, opts.maxRows) : filled).map((r) => {
        const copy = [...r];
        while (copy.length && (copy[copy.length - 1] === null || copy[copy.length - 1] === "")) copy.pop();
        return copy;
      });
      while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
      return rows;
    });
  }
}

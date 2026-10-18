import { readFileSync, writeFileSync } from "node:fs";

/** The runtime fixture file the E2E server reads as "Google Sheets". Tests mutate it. */
export const FIXTURE_PATH = "e2e/.runtime/sheets.json";

type Sheet = { sheetId: number; title: string; values: Array<Array<string | number | null>> };
type Spreadsheet = { title: string; shared?: boolean; failure?: string; sheets: Sheet[] };
type Fixture = Record<string, Spreadsheet>;

export const JOURNEY_SHEET = "1E2EFacultyJourneySpreadsheetPHY112_abcdef";
export const UNSHARED_SHEET = "1E2EUnsharedSpreadsheetForFacultyJourney_xy";

export const E2E_FIXTURE_ITEMS: Fixture = {
  [JOURNEY_SHEET]: {
    title: "PHY112 Fall 2026 — Section 05",
    sheets: [
      {
        sheetId: 0,
        title: "Class list",
        values: [
          ["Student ID", "Student Name", "Email"],
          [22101001, "Ayesha Rahman", "ayesha.rahman@g.bracu.ac.bd"],
          [22101002, "Tanvir Hasan", "tanvir.hasan@g.bracu.ac.bd"],
          [22109001, "Zarif Haque", "zarif.haque@g.bracu.ac.bd"],
        ],
      },
      {
        sheetId: 77,
        title: "Quizzes",
        values: [
          ["Student ID", "Quiz 1 (10)", "Quiz 2 (10)"],
          [22101001, 6.5, null],
          [22101002, 0, "ex"],
          [22109001, 9, 8],
        ],
      },
    ],
  },
  [UNSHARED_SHEET]: { title: "Private", shared: false, sheets: [] },
};

export function readFixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

export function writeFixture(f: Fixture) {
  writeFileSync(FIXTURE_PATH, JSON.stringify(f, null, 1));
}

export function updateSpreadsheet(id: string, fn: (s: Spreadsheet) => void) {
  const f = readFixture();
  fn(f[id]);
  writeFixture(f);
}

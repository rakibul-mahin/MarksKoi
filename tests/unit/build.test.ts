import { describe, expect, it } from "vitest";
import { buildSnapshot, cellKey, resolveWorksheets, type AssessmentConfig, type SyncConfig, type WorksheetConfig } from "@/server/sync/build";
import type { Grid, SpreadsheetMeta } from "@/server/sheets/types";

function ws(over: Partial<WorksheetConfig> & Pick<WorksheetConfig, "id" | "googleSheetId" | "title">): WorksheetConfig {
  return {
    enabled: true,
    isRoster: false,
    headerRow: 1,
    headerRows: 1,
    dataStartRow: null,
    studentIdHeader: "Student ID",
    emailHeader: null,
    nameHeader: null,
    knownHeaders: [],
    ...over,
  };
}

function assessment(id: string, name: string, columns: Array<[string, string]>, max = "10"): AssessmentConfig {
  return {
    id,
    name,
    valueType: "NUMERIC",
    maxScore: max,
    columns: columns.map(([worksheetId, header], i) => ({
      id: `${id}-c${i}`,
      worksheetId,
      header,
      normalizedHeader: header.toLowerCase(),
      lastColumnIndex: null,
    })),
  };
}

const rosterWs = ws({ id: "w-roster", googleSheetId: 0, title: "Roster", isRoster: true, emailHeader: "Email", nameHeader: "Name" });
const quizWs = ws({ id: "w-quiz", googleSheetId: 11, title: "Quizzes" });

const rosterGrid: Grid = [
  ["Student ID", "Name", "Email", "Attendance"],
  [22101001, "Ayesha Rahman", "ayesha@g.bracu.ac.bd", 5],
  ["22101002", "Tanvir Hasan", "TANVIR@g.bracu.ac.bd", ""],
  [22101003, "Nusrat Jahan", "nusrat@g.bracu.ac.bd", 0],
];
const quizGrid: Grid = [
  ["Student ID", "Quiz 1", "Quiz 2"],
  [22101001, 8, "ex"],
  [22101002, 7.5, null],
  [22101003, "pending", 10],
];

const meta: SpreadsheetMeta = {
  spreadsheetId: "s",
  title: "CSE110",
  sheets: [
    { sheetId: 0, title: "Roster", index: 0, rowCount: 100, columnCount: 26, sheetType: "GRID" },
    { sheetId: 11, title: "Quizzes", index: 1, rowCount: 100, columnCount: 26, sheetType: "GRID" },
  ],
};

function baseConfig(): SyncConfig {
  return {
    studentDomains: ["g.bracu.ac.bd"],
    worksheets: [rosterWs, quizWs],
    assessments: [
      assessment("a-att", "Attendance", [["w-roster", "Attendance"]], "5"),
      assessment("a-q1", "Quiz 1", [["w-quiz", "Quiz 1"]]),
      assessment("a-q2", "Quiz 2", [["w-quiz", "Quiz 2"]]),
    ],
  };
}

function run(config: SyncConfig, grids: Record<string, Grid>, m: SpreadsheetMeta = meta) {
  return buildSnapshot(config, resolveWorksheets(config, m), new Map(Object.entries(grids)));
}

const cell = (out: ReturnType<typeof run>, student: string, assessmentId: string) =>
  out.cells.find((c) => c.studentKey === student && c.assessmentId === assessmentId);

describe("buildSnapshot — happy path across multiple worksheets", () => {
  const out = run(baseConfig(), { "w-roster": rosterGrid, "w-quiz": quizGrid });

  it("builds the roster from the roster worksheet with normalized identities", () => {
    expect(out.structuralErrors).toBe(false);
    expect(out.roster.map((s) => [s.email, s.studentId, s.name])).toEqual([
      ["ayesha@g.bracu.ac.bd", "22101001", "Ayesha Rahman"],
      ["tanvir@g.bracu.ac.bd", "22101002", "Tanvir Hasan"],
      ["nusrat@g.bracu.ac.bd", "22101003", "Nusrat Jahan"],
    ]);
  });

  it("produces one cell per student × assessment with distinct states", () => {
    expect(out.cells).toHaveLength(9);
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-q1")).toMatchObject({ status: "SCORED", score: "8.00" });
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-q2")).toMatchObject({ status: "EXCUSED", score: null });
    expect(cell(out, "tanvir@g.bracu.ac.bd", "a-q2")).toMatchObject({ status: "MISSING" });
    expect(cell(out, "tanvir@g.bracu.ac.bd", "a-att")).toMatchObject({ status: "MISSING" });
    expect(cell(out, "nusrat@g.bracu.ac.bd", "a-att")).toMatchObject({ status: "SCORED", score: "0.00" });
    expect(cell(out, "nusrat@g.bracu.ac.bd", "a-q1")).toMatchObject({ status: "PENDING" });
  });

  it("has no errors and records known headers", () => {
    expect(out.issues.filter((i) => i.severity === "ERROR")).toEqual([]);
    expect(out.worksheetUpdates.find((w) => w.worksheetId === "w-quiz")?.knownHeaders).toEqual(["student id", "quiz 1", "quiz 2"]);
    expect(out.rowsRead).toBe(6);
  });
});

describe("buildSnapshot — structural validation", () => {
  it("follows a renamed worksheet by sheetId", () => {
    const renamed = { ...meta, sheets: meta.sheets.map((s) => (s.sheetId === 11 ? { ...s, title: "Quiz Marks" } : s)) };
    const out = run(baseConfig(), { "w-roster": rosterGrid, "w-quiz": quizGrid }, renamed);
    expect(out.structuralErrors).toBe(false);
    expect(out.issues.map((i) => i.code)).toContain("WORKSHEET_RENAMED");
  });

  it("fails when a worksheet was deleted", () => {
    const deleted = { ...meta, sheets: meta.sheets.filter((s) => s.sheetId !== 11) };
    const out = run(baseConfig(), { "w-roster": rosterGrid }, deleted);
    expect(out.structuralErrors).toBe(true);
    expect(out.issues.map((i) => i.code)).toContain("WORKSHEET_MISSING");
    expect(out.cells).toEqual([]);
  });

  it("follows a column moved by an inserted column", () => {
    const config = baseConfig();
    config.assessments[1].columns[0].lastColumnIndex = 1;
    const shifted: Grid = quizGrid.map((r, i) => [r[0], i === 0 ? "Notes" : "", ...r.slice(1)]);
    const out = run(config, { "w-roster": rosterGrid, "w-quiz": shifted });
    expect(out.structuralErrors).toBe(false);
    expect(out.issues.map((i) => i.code)).toContain("COLUMN_MOVED");
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-q1")).toMatchObject({ score: "8.00" });
    expect(out.columnUpdates).toContainEqual({ columnId: "a-q1-c0", index: 2 });
  });

  it("requires review when a mapped column is renamed (never guesses)", () => {
    const renamedHeader: Grid = [["Student ID", "Quiz One", "Quiz 2"], ...quizGrid.slice(1)];
    const out = run(baseConfig(), { "w-roster": rosterGrid, "w-quiz": renamedHeader });
    expect(out.structuralErrors).toBe(true);
    expect(out.issues.find((i) => i.code === "COLUMN_NOT_FOUND")).toMatchObject({ worksheetTitle: "Quizzes", columnHeader: "Quiz 1" });
  });

  it("rejects duplicate mapped headers", () => {
    const dup: Grid = [["Student ID", "Quiz 1", "quiz 1 "], ...quizGrid.slice(1)];
    const out = run(baseConfig(), { "w-roster": rosterGrid, "w-quiz": dup });
    expect(out.structuralErrors).toBe(true);
    expect(out.issues.map((i) => i.code)).toContain("DUPLICATE_HEADER");
  });

  it("rejects empty worksheets and missing identity columns", () => {
    expect(run(baseConfig(), { "w-roster": rosterGrid, "w-quiz": [] }).issues.map((i) => i.code)).toContain("WORKSHEET_EMPTY");
    const noId: Grid = [["ID", "Quiz 1", "Quiz 2"], ...quizGrid.slice(1)];
    const out = run(baseConfig(), { "w-roster": rosterGrid, "w-quiz": noId });
    expect(out.structuralErrors).toBe(true);
    expect(out.issues.map((i) => i.code)).toContain("IDENTITY_COLUMN_MISSING");
  });

  it("requires exactly one roster worksheet", () => {
    const config = baseConfig();
    config.worksheets = [{ ...rosterWs, isRoster: false }, quizWs];
    expect(run(config, { "w-roster": rosterGrid, "w-quiz": quizGrid }).structuralErrors).toBe(true);
  });

  it("flags newly added unmapped columns without importing them", () => {
    const config = baseConfig();
    config.worksheets = [rosterWs, { ...quizWs, knownHeaders: ["student id", "quiz 1", "quiz 2"] }];
    const withNew: Grid = quizGrid.map((r, i) => [...r, i === 0 ? "Quiz 3" : 9]);
    const out = run(config, { "w-roster": rosterGrid, "w-quiz": withNew });
    expect(out.structuralErrors).toBe(false);
    expect(out.issues.find((i) => i.code === "NEW_COLUMN")).toMatchObject({ severity: "INFO", columnHeader: "Quiz 3" });
    expect(out.cells.every((c) => ["a-att", "a-q1", "a-q2"].includes(c.assessmentId))).toBe(true);
  });
});

describe("buildSnapshot — row and cell validation", () => {
  it("skips duplicate roster rows and freezes that student's roster marks", () => {
    const dup: Grid = [...rosterGrid, [22101009, "Copy", "ayesha@g.bracu.ac.bd", 3]];
    const out = run(baseConfig(), { "w-roster": dup, "w-quiz": quizGrid });
    expect(out.roster).toHaveLength(3);
    expect(out.issues.find((i) => i.code === "DUPLICATE_STUDENT")).toMatchObject({ rowNumber: 5, worksheetTitle: "Roster" });
    expect(out.invalidCellKeys.has(cellKey("ayesha@g.bracu.ac.bd", "a-att"))).toBe(true);
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-q1")).toMatchObject({ score: "8.00" });
  });

  it("rejects duplicate student ids with different emails", () => {
    const dup: Grid = [...rosterGrid, [22101001, "Imposter", "other@g.bracu.ac.bd", 3]];
    const out = run(baseConfig(), { "w-roster": dup, "w-quiz": quizGrid });
    expect(out.roster.map((s) => s.email)).not.toContain("other@g.bracu.ac.bd");
    expect(out.issues.map((i) => i.code)).toContain("DUPLICATE_STUDENT_ID");
  });

  it("syncs students without an official email (identified by ID) with a no-portal-access warning", () => {
    const rows: Grid = [...rosterGrid, [22101007, "Personal Mail", "someone@gmail.com", 1], [22101008, "Not Yet", "NA", 2], [22101009, "Blank", "", 3]];
    const quiz: Grid = [...quizGrid, [22101008, 6, 7]];
    const out = run(baseConfig(), { "w-roster": rows, "w-quiz": quiz });
    expect(out.structuralErrors).toBe(false);
    expect(out.roster).toHaveLength(6);
    expect(out.roster.find((r) => r.studentId === "22101008")).toMatchObject({ key: "id:22101008", email: null, name: "Not Yet" });
    expect(out.issues.filter((i) => i.severity === "ERROR")).toEqual([]);
    const warnings = out.issues.filter((i) => i.code === "NO_PORTAL_EMAIL");
    expect(warnings.map((w) => w.rowNumber)).toEqual([5, 6, 7]);
    expect(warnings[0].message).toContain("someone@gmail.com, which isn't an official student email");
    expect(warnings[1].message).toContain('has "NA" instead of an email');
    // Their marks from other worksheets are matched by student ID.
    expect(cell(out, "id:22101008", "a-q1")).toMatchObject({ status: "SCORED", score: "6.00" });
  });

  it("still skips rows with neither an official email nor a student ID", () => {
    const rows: Grid = [...rosterGrid, [null, "Nobody", "NA", 1], ["??", "Bad ID", "", 1]];
    const out = run(baseConfig(), { "w-roster": rows, "w-quiz": quizGrid });
    expect(out.roster).toHaveLength(3);
    expect(out.issues.filter((i) => i.code === "ROW_MISSING_IDENTITY").map((i) => i.rowNumber)).toEqual([5, 6]);
  });

  it("detects duplicate students without emails by student ID", () => {
    const rows: Grid = [...rosterGrid, [22101008, "Not Yet", "NA", 2], [22101008, "Not Yet again", "", 2]];
    const out = run(baseConfig(), { "w-roster": rows, "w-quiz": quizGrid });
    expect(out.roster.filter((r) => r.studentId === "22101008")).toHaveLength(1);
    expect(out.issues.find((i) => i.code === "DUPLICATE_STUDENT")).toMatchObject({ rowNumber: 6 });
  });

  it("rejects invalid marks with worksheet/row/column context and keeps them out of the import", () => {
    const bad: Grid = [quizGrid[0], [22101001, 12, "abc"], ...quizGrid.slice(2)];
    const out = run(baseConfig(), { "w-roster": rosterGrid, "w-quiz": bad });
    expect(out.structuralErrors).toBe(false);
    expect(out.issues.find((i) => i.code === "ABOVE_MAXIMUM")).toMatchObject({ worksheetTitle: "Quizzes", rowNumber: 2, columnHeader: "Quiz 1" });
    expect(out.issues.find((i) => i.code === "UNSUPPORTED_VALUE")).toMatchObject({ rowNumber: 2, columnHeader: "Quiz 2" });
    expect(out.invalidCellKeys.has(cellKey("ayesha@g.bracu.ac.bd", "a-q1"))).toBe(true);
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-q1")).toBeUndefined();
  });

  it("rejects rows for students who are not in the roster", () => {
    const extra: Grid = [...quizGrid, [99999999, 5, 5]];
    const out = run(baseConfig(), { "w-roster": rosterGrid, "w-quiz": extra });
    expect(out.issues.find((i) => i.code === "STUDENT_NOT_IN_ROSTER")).toMatchObject({ rowNumber: 5 });
  });

  it("detects identity mismatches between email and student id", () => {
    const config = baseConfig();
    config.worksheets = [rosterWs, { ...quizWs, emailHeader: "Email" }];
    const grid: Grid = [["Student ID", "Email", "Quiz 1", "Quiz 2"], [22101001, "tanvir@g.bracu.ac.bd", 5, 5]];
    const out = run(config, { "w-roster": rosterGrid, "w-quiz": grid });
    expect(out.issues.map((i) => i.code)).toContain("IDENTITY_MISMATCH");
  });

  it("warns about blank rows in the middle of data", () => {
    const gap: Grid = [quizGrid[0], quizGrid[1], [], [null, ""], quizGrid[2], quizGrid[3]];
    const out = run(baseConfig(), { "w-roster": rosterGrid, "w-quiz": gap });
    expect(out.issues.find((i) => i.code === "EMPTY_ROWS")).toMatchObject({ severity: "WARNING", rowNumber: 3 });
    expect(cell(out, "tanvir@g.bracu.ac.bd", "a-q1")).toMatchObject({ score: "7.50" });
  });

  it("supports a header row below a title row", () => {
    const config = baseConfig();
    config.worksheets = [rosterWs, { ...quizWs, headerRow: 2 }];
    const titled: Grid = [["CSE110 Quiz marks"], ...quizGrid];
    const out = run(config, { "w-roster": rosterGrid, "w-quiz": titled });
    expect(out.structuralErrors).toBe(false);
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-q1")).toMatchObject({ score: "8.00" });
  });
});

describe("buildSnapshot — assessments split across worksheets", () => {
  const labA = ws({ id: "w-la", googleSheetId: 21, title: "Lab A" });
  const labB = ws({ id: "w-lb", googleSheetId: 22, title: "Lab B" });
  const splitMeta: SpreadsheetMeta = {
    ...meta,
    sheets: [...meta.sheets, { ...meta.sheets[1], sheetId: 21, title: "Lab A" }, { ...meta.sheets[1], sheetId: 22, title: "Lab B" }],
  };
  const config: SyncConfig = {
    studentDomains: ["g.bracu.ac.bd"],
    worksheets: [rosterWs, labA, labB],
    assessments: [assessment("a-lab", "Lab 1", [["w-la", "Lab 1"], ["w-lb", "Lab 1"]])],
  };

  it("takes each student's value from whichever worksheet has it", () => {
    const out = run(config, {
      "w-roster": rosterGrid,
      "w-la": [["Student ID", "Lab 1"], [22101001, 9]],
      "w-lb": [["Student ID", "Lab 1"], [22101002, 6]],
    }, splitMeta);
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-lab")).toMatchObject({ score: "9.00" });
    expect(cell(out, "tanvir@g.bracu.ac.bd", "a-lab")).toMatchObject({ score: "6.00" });
    expect(cell(out, "nusrat@g.bracu.ac.bd", "a-lab")).toMatchObject({ status: "MISSING" });
  });

  it("refuses ambiguous values present in more than one worksheet", () => {
    const out = run(config, {
      "w-roster": rosterGrid,
      "w-la": [["Student ID", "Lab 1"], [22101001, 9]],
      "w-lb": [["Student ID", "Lab 1"], [22101001, 6]],
    }, splitMeta);
    expect(out.issues.map((i) => i.code)).toContain("AMBIGUOUS_SPLIT_VALUE");
    expect(out.invalidCellKeys.has(cellKey("ayesha@g.bracu.ac.bd", "a-lab"))).toBe(true);
  });
});

describe("buildSnapshot — merged cells and multi-row titles", () => {
  // Grid as returned after merge expansion: SL/ID/NAME were merged over rows 1–2, row 2 holds
  // maximum marks, and rows 4+ are pre-numbered template rows with formula totals of 0.
  const finalGrid: Grid = [
    ["SL", "ID", "NAME", "Q1", "Q2", "Q3", "Q4", "TOTAL FINAL"],
    ["SL", "ID", "NAME", 12, 10, 4, 4, 30],
    [1, 22101001, "Ayesha Rahman", 10.5, 4.5, 3, 3.5, 21.5],
    [2, 22101002, "Tanvir Hasan", 9, 8, 4, 2, 23],
    [3, null, null, null, null, null, null, 0],
    [4, null, null, null, null, null, null, 0],
  ];
  const finalWs = ws({ id: "w-final", googleSheetId: 22, title: "Final", studentIdHeader: "ID", nameHeader: "NAME" });
  const finalMeta: SpreadsheetMeta = { ...meta, sheets: [...meta.sheets, { sheetId: 22, title: "Final", index: 2, rowCount: 100, columnCount: 26, sheetType: "GRID" }] };
  const config = (over: Partial<WorksheetConfig> = {}): SyncConfig => ({
    ...baseConfig(),
    worksheets: [rosterWs, { ...finalWs, ...over }],
    assessments: [assessment("a-q1f", "Q1", [["w-final", "Q1"]], "12"), assessment("a-tot", "Total", [["w-final", "TOTAL FINAL"]], "30")],
  });

  it("treats the max-marks row as titles and skips template rows without errors", () => {
    const out = run(config(), { "w-roster": rosterGrid, "w-final": finalGrid }, finalMeta);
    expect(out.structuralErrors).toBe(false);
    expect(out.issues.filter((i) => i.severity !== "INFO")).toEqual([]);
    expect(out.issues.find((i) => i.code === "HEADER_ROWS_SKIPPED")?.message).toContain("Student data starts at row 3");
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-q1f")).toMatchObject({ status: "SCORED", score: "10.50" });
    expect(cell(out, "tanvir@g.bracu.ac.bd", "a-tot")).toMatchObject({ status: "SCORED", score: "23.00" });
  });

  it("honours an explicit start row and still skips repeated title rows", () => {
    const out = run(config({ dataStartRow: 2 }), { "w-roster": rosterGrid, "w-final": finalGrid }, finalMeta);
    expect(out.structuralErrors).toBe(false);
    expect(out.issues.filter((i) => i.severity === "ERROR")).toEqual([]);
  });

  it("reports template rows that sit between students", () => {
    const grid = [...finalGrid.slice(0, 3), [9, null, null, null, null, null, null, 0], finalGrid[3]];
    const out = run(config(), { "w-roster": rosterGrid, "w-final": grid }, finalMeta);
    expect(out.issues.find((i) => i.code === "UNFILLED_ROWS")).toMatchObject({ severity: "WARNING", rowNumber: 4 });
  });

  it("still flags rows with marks but no student", () => {
    const grid = [...finalGrid.slice(0, 4), [3, null, null, 7, null, null, null, 7]];
    const out = run(config(), { "w-roster": rosterGrid, "w-final": grid }, finalMeta);
    expect(out.issues.find((i) => i.code === "ROW_MISSING_IDENTITY")).toMatchObject({ severity: "ERROR", rowNumber: 5 });
  });

  it("combines title rows so a merged group title doesn't create duplicate headers", () => {
    const grouped: Grid = [
      ["Student ID", "Quiz", "Quiz", "Assignment", "Assignment"],
      ["Student ID", "Q1", "Q2", "Q1", "Q2"],
      [22101001, 8, 9, 5, 4],
    ];
    const cfg: SyncConfig = {
      ...baseConfig(),
      worksheets: [rosterWs, { ...quizWs, headerRows: 2 }],
      assessments: [assessment("a-q", "Quiz 2", [["w-quiz", "Quiz › Q2"]]), assessment("a-a", "Assignment 1", [["w-quiz", "Assignment › Q1"]])],
    };
    const out = run(cfg, { "w-roster": rosterGrid, "w-quiz": grouped });
    expect(out.structuralErrors).toBe(false);
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-q")?.score).toBe("9.00");
    expect(cell(out, "ayesha@g.bracu.ac.bd", "a-a")?.score).toBe("5.00");

    const single = run({ ...cfg, worksheets: [rosterWs, quizWs], assessments: [assessment("a-x", "Quiz", [["w-quiz", "Quiz"]])] }, { "w-roster": rosterGrid, "w-quiz": grouped });
    expect(single.issues.find((i) => i.code === "DUPLICATE_HEADER")).toBeTruthy();
  });
});

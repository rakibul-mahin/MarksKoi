import { describe, expect, it } from "vitest";
import { combinedHeaders, detectDataStartRow, fillMerges, headerRowsLabel, maxMarkHint } from "@/lib/sheet-layout";

describe("fillMerges", () => {
  it("copies a merged value into every cell of the range without creating rows", () => {
    const grid: Array<Array<string | number | null>> = [["SL", "Quiz", null, null], [null, "Q1", "Q2", "Q3"], [1, 5, 6]];
    const out = fillMerges(grid, [
      { startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 },
      { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 4 },
      { startRowIndex: 2, endRowIndex: 9, startColumnIndex: 3, endColumnIndex: 5 }, // blank anchor: ignored
    ]);
    expect(out).toEqual([["SL", "Quiz", "Quiz", "Quiz"], ["SL", "Q1", "Q2", "Q3"], [1, 5, 6]]);
    expect(grid[1][0]).toBeNull(); // input untouched
  });

  it("pads short rows (Google trims trailing blanks)", () => {
    expect(fillMerges<string | number>([["Group mark", 8], ["x"]], [{ startRowIndex: 0, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 }])).toEqual([
      ["Group mark", 8],
      ["x", 8],
    ]);
  });
});

describe("combinedHeaders", () => {
  const grid = [
    ["ID", "Quiz", "Quiz", "Mid"],
    ["ID", "Q1", "Q2", ""],
  ];
  it("joins title rows per column and drops repeats from vertical merges", () => {
    expect(combinedHeaders(grid, 1, 2)).toEqual(["ID", "Quiz › Q1", "Quiz › Q2", "Mid"]);
    expect(combinedHeaders(grid, 1)).toEqual(["ID", "Quiz", "Quiz", "Mid"]);
    expect(headerRowsLabel(1, 2)).toBe("rows 1–2");
    expect(headerRowsLabel(3)).toBe("row 3");
  });
});

describe("detectDataStartRow / maxMarkHint", () => {
  // The layout from the bug report: SL/ID/NAME merged over rows 1–2, max marks in row 2.
  const grid = [
    ["SL", "ID", "NAME", "Q1", "Q2", "Q3", "Q4", "TOTAL FINAL"],
    ["SL", "ID", "NAME", 12, 10, 4, 4, 30],
    [1, 20201220, "Mohammad Rakibul Hasan Mahin", 10.5, 4.5, 3, 3.5, 21.5],
  ];
  it("skips rows without a student ID or email after the titles", () => {
    expect(detectDataStartRow(grid, { headerRow: 1 }, { idCol: 1, emailCol: null })).toBe(3);
    expect(detectDataStartRow(grid, { headerRow: 1 }, { idCol: null, emailCol: null })).toBe(2);
  });
  it("reads maximum marks from the skipped rows", () => {
    expect(maxMarkHint(grid, 2, 3, 3)).toBe("12");
    expect(maxMarkHint(grid, 2, 3, 2)).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { markKey, parseCell } from "@/server/sync/cell";

const numeric = { valueType: "NUMERIC" as const, maxScore: "10" };
const text = { valueType: "TEXT" as const, maxScore: null };

describe("parseCell", () => {
  it("treats blank cells as MISSING, never zero", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(parseCell(v, numeric)).toEqual({ ok: true, status: "MISSING", score: null, textValue: null, raw: null });
    }
  });

  it("keeps a real zero as a SCORED 0", () => {
    expect(parseCell(0, numeric)).toMatchObject({ ok: true, status: "SCORED", score: "0.00" });
    expect(parseCell("0", numeric)).toMatchObject({ ok: true, status: "SCORED", score: "0.00" });
  });

  it("parses numbers and numeric strings with decimal-safe rounding", () => {
    expect(parseCell(7.5, numeric)).toMatchObject({ status: "SCORED", score: "7.50" });
    expect(parseCell(" 8.25 ", numeric)).toMatchObject({ status: "SCORED", score: "8.25" });
    expect(parseCell(7.005, numeric)).toMatchObject({ status: "SCORED", score: "7.01" });
    expect(parseCell(9.999, numeric)).toMatchObject({ status: "SCORED", score: "10.00" });
  });

  it("maps status words to distinct states", () => {
    expect(parseCell("Pending", numeric)).toMatchObject({ ok: true, status: "PENDING" });
    expect(parseCell("TBD", numeric)).toMatchObject({ ok: true, status: "PENDING" });
    expect(parseCell("EX", numeric)).toMatchObject({ ok: true, status: "EXCUSED" });
    expect(parseCell(" excused ", numeric)).toMatchObject({ ok: true, status: "EXCUSED" });
    expect(parseCell("AB", numeric)).toMatchObject({ ok: true, status: "ABSENT" });
    expect(parseCell("-", numeric)).toMatchObject({ ok: true, status: "MISSING" });
  });

  it("rejects values above the maximum instead of clamping", () => {
    const r = parseCell(11, numeric);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ABOVE_MAXIMUM");
  });

  it("rejects negative and non-numeric values instead of converting to zero", () => {
    expect(parseCell(-1, numeric)).toMatchObject({ ok: false, code: "NEGATIVE_SCORE" });
    expect(parseCell("-2", numeric)).toMatchObject({ ok: false, code: "NEGATIVE_SCORE" });
    expect(parseCell("abc", numeric)).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
    expect(parseCell("7/10", numeric)).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
    expect(parseCell("75%", numeric)).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
    expect(parseCell(true, numeric)).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
    expect(parseCell(Number.NaN, numeric)).toMatchObject({ ok: false, code: "INVALID_NUMBER" });
  });

  it("accepts text for TEXT assessments (e.g. official grade) and still honours status words", () => {
    expect(parseCell(" A- ", text)).toMatchObject({ ok: true, status: "SCORED", textValue: "A-", score: null });
    expect(parseCell(4, text)).toMatchObject({ ok: true, status: "SCORED", textValue: "4" });
    expect(parseCell("pending", text)).toMatchObject({ ok: true, status: "PENDING" });
    expect(parseCell("x".repeat(65), text)).toMatchObject({ ok: false, code: "TEXT_TOO_LONG" });
  });
});

describe("markKey", () => {
  it("treats equal decimals as equal regardless of formatting", () => {
    expect(markKey({ status: "SCORED", score: "7.5", textValue: null })).toBe(markKey({ status: "SCORED", score: "7.50", textValue: null }));
    expect(markKey({ status: "SCORED", score: "0", textValue: null })).not.toBe(markKey({ status: "MISSING", score: null, textValue: null }));
  });
});

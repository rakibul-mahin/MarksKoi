import { describe, expect, it } from "vitest";
import { parseCell } from "@/server/sync/cell";
import { guessValueType, percentBand, statusTone } from "@/lib/value-types";

const parse = (value: unknown, valueType: Parameters<typeof parseCell>[1]["valueType"]) => parseCell(value, { valueType, maxScore: null });

describe("parseCell — attendance-sheet value types", () => {
  it("reads yes/no values, including checkboxes", () => {
    expect(parse(true, "BOOLEAN")).toMatchObject({ ok: true, status: "SCORED", textValue: "Yes" });
    expect(parse("FALSE", "BOOLEAN")).toMatchObject({ ok: true, textValue: "No" });
    expect(parse(0, "BOOLEAN")).toMatchObject({ ok: true, textValue: "No" });
    expect(parse(null, "BOOLEAN")).toMatchObject({ ok: true, status: "MISSING" });
    expect(parse("maybe", "BOOLEAN")).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
  });

  it("reads whole-number counts without a maximum", () => {
    expect(parse(3, "COUNT")).toMatchObject({ ok: true, score: "3.00" });
    expect(parse(250, "COUNT")).toMatchObject({ ok: true, score: "250.00" });
    expect(parse(1.5, "COUNT")).toMatchObject({ ok: false, code: "NOT_WHOLE_NUMBER" });
  });

  it("reads percentages stored as fractions, text with % or plain numbers", () => {
    expect(parse(1, "PERCENT")).toMatchObject({ ok: true, score: "100.00" });
    expect(parse(0.9, "PERCENT")).toMatchObject({ ok: true, score: "90.00" });
    expect(parse("87.5%", "PERCENT")).toMatchObject({ ok: true, score: "87.50" });
    expect(parse(95, "PERCENT")).toMatchObject({ ok: true, score: "95.00" });
    expect(parse(120, "PERCENT")).toMatchObject({ ok: false, code: "ABOVE_MAXIMUM" });
  });

  it("reads class attendance as present / absent / sick", () => {
    expect(parse(1, "ATTENDANCE")).toMatchObject({ ok: true, status: "SCORED", textValue: "Present" });
    expect(parse(0, "ATTENDANCE")).toMatchObject({ ok: true, textValue: "Absent" });
    expect(parse("S", "ATTENDANCE")).toMatchObject({ ok: true, textValue: "Sick" });
    expect(parse("absent", "ATTENDANCE")).toMatchObject({ ok: true, status: "SCORED", textValue: "Absent" });
    expect(parse("", "ATTENDANCE")).toMatchObject({ ok: true, status: "MISSING" });
    expect(parse(2, "ATTENDANCE")).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
  });

  it("keeps status words as text", () => {
    expect(parse(" ELIGIBLE ", "STATUS")).toMatchObject({ ok: true, textValue: "ELIGIBLE" });
  });
});

describe("percentBand / statusTone", () => {
  it("is good above the threshold, a warning at it and barred below", () => {
    expect(percentBand("100.00", "90")?.label).toBe("Good");
    expect(percentBand("90.00", "90.00")?.label).toBe("Warning");
    expect(percentBand("89.99", "90")?.label).toBe("Barred");
    expect(percentBand("95", null)).toBeNull();
  });
  it("colours eligibility words", () => {
    expect(statusTone("ELIGIBLE")).toBe("success");
    expect(statusTone("Not Eligible")).toBe("danger");
    expect(statusTone("BARRED")).toBe("danger");
    expect(statusTone("WARNING")).toBe("warning");
    expect(statusTone("see me")).toBe("neutral");
  });
});

describe("guessValueType", () => {
  it("recognizes the columns of an attendance sheet", () => {
    expect(guessValueType("LAB POLICY", ["FALSE", "", ""])).toBe("BOOLEAN");
    expect(guessValueType("ABSENT", ["0", "0", "2"])).toBe("COUNT");
    expect(guessValueType("ATTD. (%)", ["1", "0.9"])).toBe("PERCENT");
    expect(guessValueType("ELIGIBILITY", ["ELIGIBLE", "WARNING"])).toBe("STATUS");
    expect(guessValueType("LAB-1", ["1", "0", "S"], ["ATTENDANCE [Present=1, Absent=0]", "10/14/26"])).toBe("ATTENDANCE");
    expect(guessValueType("LAB-2", ["", ""], ["ATTENDANCE [Present=1, Absent=0]", "10/28/26"])).toBe("ATTENDANCE");
    expect(guessValueType("EXAM-1", ["7", "8.5"])).toBe("NUMERIC");
    expect(guessValueType("LAB-3", ["", ""])).toBe("NUMERIC");
  });
});

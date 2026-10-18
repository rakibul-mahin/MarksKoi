import { Decimal } from "@prisma/client/runtime/index-browser";
import { ATTENDANCE_VALUES, NO, YES, type ValueTypeName } from "@/lib/value-types";

/**
 * Converts one spreadsheet cell into a mark state. Blank cells are MISSING (not zero), status
 * words map to explicit states, and anything we cannot interpret is rejected, never coerced.
 */
export type MarkStatusValue = "SCORED" | "MISSING" | "PENDING" | "EXCUSED" | "ABSENT";

export type ParsedCell =
  | { ok: true; status: MarkStatusValue; score: string | null; textValue: string | null; raw: string | null }
  | { ok: false; code: "INVALID_NUMBER" | "NEGATIVE_SCORE" | "ABOVE_MAXIMUM" | "UNSUPPORTED_VALUE" | "TEXT_TOO_LONG" | "NOT_WHOLE_NUMBER"; message: string; raw: string };

export type CellRule = { valueType: ValueTypeName; maxScore: string | null };

const BOOLEAN_TOKENS: Record<string, string> = {
  true: YES, yes: YES, y: YES, "✓": YES, "✔": YES, "1": YES, signed: YES,
  false: NO, no: NO, n: NO, "✗": NO, "✘": NO, "0": NO, "not signed": NO, unsigned: NO,
};

const ATTENDANCE_TOKENS: Record<string, string> = {
  "1": ATTENDANCE_VALUES.PRESENT, p: ATTENDANCE_VALUES.PRESENT, present: ATTENDANCE_VALUES.PRESENT, true: ATTENDANCE_VALUES.PRESENT,
  "0": ATTENDANCE_VALUES.ABSENT, a: ATTENDANCE_VALUES.ABSENT, ab: ATTENDANCE_VALUES.ABSENT, abs: ATTENDANCE_VALUES.ABSENT, absent: ATTENDANCE_VALUES.ABSENT, false: ATTENDANCE_VALUES.ABSENT,
  s: ATTENDANCE_VALUES.SICK, sick: ATTENDANCE_VALUES.SICK,
};

/** Recognized status words (case-insensitive, surrounding spaces ignored). */
export const STATUS_TOKENS: Record<string, Exclude<MarkStatusValue, "SCORED">> = {
  "-": "MISSING",
  "–": "MISSING",
  "—": "MISSING",
  pending: "PENDING",
  tbd: "PENDING",
  tba: "PENDING",
  "not graded": "PENDING",
  ex: "EXCUSED",
  exc: "EXCUSED",
  excused: "EXCUSED",
  ab: "ABSENT",
  abs: "ABSENT",
  absent: "ABSENT",
};

const NUMBER_RE = /^[+]?(\d+(\.\d*)?|\.\d+)$/;
const MAX_TEXT_LENGTH = 64;

function rawString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = typeof value === "string" ? value : String(value);
  return s.length > 200 ? s.slice(0, 200) : s;
}

export function parseCell(value: unknown, rule: CellRule): ParsedCell {
  const raw = rawString(value);

  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return { ok: true, status: "MISSING", score: null, textValue: null, raw: null };
  }

  const key = String(value).replace(/\s+/g, " ").trim().toLowerCase();

  // Attendance and yes/no columns have their own small vocabularies ("absent" is a value here,
  // not the absent-from-assessment status).
  if (rule.valueType === "ATTENDANCE") {
    const v = ATTENDANCE_TOKENS[key];
    if (v) return { ok: true, status: "SCORED", score: null, textValue: v, raw };
    if (STATUS_TOKENS[key] && STATUS_TOKENS[key] !== "ABSENT") return { ok: true, status: STATUS_TOKENS[key], score: null, textValue: null, raw };
    return { ok: false, code: "UNSUPPORTED_VALUE", message: `"${raw}" isn't an attendance value. Use 1 (present), 0 (absent) or S (sick).`, raw: raw ?? "" };
  }
  if (rule.valueType === "BOOLEAN") {
    const v = BOOLEAN_TOKENS[key];
    if (v) return { ok: true, status: "SCORED", score: null, textValue: v, raw };
    if (STATUS_TOKENS[key]) return { ok: true, status: STATUS_TOKENS[key], score: null, textValue: null, raw };
    return { ok: false, code: "UNSUPPORTED_VALUE", message: `"${raw}" isn't a yes/no value. Use TRUE / FALSE, a checkbox, or Yes / No.`, raw: raw ?? "" };
  }

  if (typeof value === "string") {
    const token = STATUS_TOKENS[value.trim().toLowerCase()];
    if (token) return { ok: true, status: token, score: null, textValue: null, raw };
  }

  if (rule.valueType === "TEXT" || rule.valueType === "STATUS") {
    if (typeof value !== "string" && typeof value !== "number") {
      return { ok: false, code: "UNSUPPORTED_VALUE", message: `"${raw}" is not a supported value.`, raw: raw ?? "" };
    }
    const text = String(value).replace(/\s+/g, " ").trim();
    if (text.length > MAX_TEXT_LENGTH) {
      return { ok: false, code: "TEXT_TOO_LONG", message: `Value is longer than ${MAX_TEXT_LENGTH} characters.`, raw: raw ?? "" };
    }
    return { ok: true, status: "SCORED", score: null, textValue: text, raw };
  }

  let decimal: Decimal;
  // Percentages: Sheets stores 95% as 0.95 (unformatted); "95%" and 95 are also accepted.
  const percentText = rule.valueType === "PERCENT" && typeof value === "string" && /%\s*$/.test(value);
  if (percentText) value = (value as string).replace(/%\s*$/, "");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { ok: false, code: "INVALID_NUMBER", message: `"${raw}" is not a valid number.`, raw: raw ?? "" };
    }
    decimal = new Decimal(String(value));
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("-") && NUMBER_RE.test(trimmed.slice(1))) {
      return { ok: false, code: "NEGATIVE_SCORE", message: `Negative score "${trimmed}" is not allowed.`, raw: raw ?? "" };
    }
    if (!NUMBER_RE.test(trimmed)) {
      return {
        ok: false,
        code: "UNSUPPORTED_VALUE",
        message: `"${trimmed}" is not a number or a recognized status (pending, excused, absent, or blank).`,
        raw: raw ?? "",
      };
    }
    decimal = new Decimal(trimmed);
  } else {
    return { ok: false, code: "UNSUPPORTED_VALUE", message: `"${raw}" is not a number.`, raw: raw ?? "" };
  }

  if (rule.valueType === "PERCENT" && !percentText && decimal.lessThanOrEqualTo(1)) decimal = decimal.times(100);
  if (rule.valueType === "PERCENT" && decimal.greaterThan(100)) {
    return { ok: false, code: "ABOVE_MAXIMUM", message: `${decimal.toString()}% is above 100%.`, raw: raw ?? "" };
  }
  if (rule.valueType === "COUNT" && !decimal.isInteger()) {
    return { ok: false, code: "NOT_WHOLE_NUMBER", message: `"${raw}" isn't a whole number.`, raw: raw ?? "" };
  }
  if (decimal.isNegative()) {
    return { ok: false, code: "NEGATIVE_SCORE", message: `Negative score "${raw}" is not allowed.`, raw: raw ?? "" };
  }
  const rounded = decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (rule.valueType === "NUMERIC" && rule.maxScore !== null && rounded.greaterThan(new Decimal(rule.maxScore))) {
    return {
      ok: false,
      code: "ABOVE_MAXIMUM",
      message: `Score ${rounded.toString()} is above the maximum of ${new Decimal(rule.maxScore).toString()}.`,
      raw: raw ?? "",
    };
  }
  if (rounded.greaterThanOrEqualTo(new Decimal("1000000"))) {
    return { ok: false, code: "INVALID_NUMBER", message: `"${raw}" is too large.`, raw: raw ?? "" };
  }
  return { ok: true, status: "SCORED", score: rounded.toFixed(2), textValue: null, raw };
}

/** Canonical comparison key for idempotent diffs. */
export function markKey(m: { status: MarkStatusValue; score: string | null; textValue: string | null }): string {
  const score = m.score === null ? "" : new Decimal(m.score).toFixed(2);
  return `${m.status}|${score}|${m.textValue ?? ""}`;
}

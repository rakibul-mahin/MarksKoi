/**
 * What kind of value an assessment column holds, how it is shown, and the helpers that decide
 * colours/labels. Shared by the mapping editor, the sync parser and the student results view.
 */
export type ValueTypeName = "NUMERIC" | "TEXT" | "BOOLEAN" | "COUNT" | "PERCENT" | "ATTENDANCE" | "STATUS";

export const VALUE_TYPE_LABEL: Record<ValueTypeName, string> = {
  NUMERIC: "Marks",
  TEXT: "Text",
  BOOLEAN: "Yes / No",
  COUNT: "Count",
  PERCENT: "Percentage",
  ATTENDANCE: "Attendance (1 / 0 / S)",
  STATUS: "Status badge",
};

export const VALUE_TYPE_HELP: Record<ValueTypeName, string> = {
  NUMERIC: "A mark out of a maximum.",
  TEXT: "Shown exactly as written in the sheet.",
  BOOLEAN: "TRUE / FALSE, a checkbox, Yes / No or 1 / 0.",
  COUNT: "A whole number with no maximum, such as the number of absences.",
  PERCENT: "A percentage compared with a threshold: above it is good, equal is a warning, below is barred.",
  ATTENDANCE: "One class session: 1 = present, 0 = absent, S = sick (attendance considered).",
  STATUS: "A word such as Eligible, Warning or Barred, shown as a coloured badge.",
};

export const DEFAULT_PERCENT_THRESHOLD = "90";

/** Canonical stored text for the fixed-vocabulary types. */
export const YES = "Yes";
export const NO = "No";
export const ATTENDANCE_VALUES = { PRESENT: "Present", ABSENT: "Absent", SICK: "Sick" } as const;

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export type PercentBand = { label: "Good" | "Warning" | "Barred"; tone: Tone };

/** Above the threshold is good, exactly at it is a warning, below it is barred. */
export function percentBand(score: string | number | null, threshold: string | number | null): PercentBand | null {
  if (score === null || threshold === null || threshold === "") return null;
  const s = Math.round(Number(score) * 100);
  const t = Math.round(Number(threshold) * 100);
  if (!Number.isFinite(s) || !Number.isFinite(t)) return null;
  if (s > t) return { label: "Good", tone: "success" };
  if (s === t) return { label: "Warning", tone: "warning" };
  return { label: "Barred", tone: "danger" };
}

/** Colour for a status word: "Not eligible" and "Barred" are red, "Warning" amber, "Eligible" green. */
export function statusTone(text: string | null): Tone {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return "neutral";
  if (/\b(not|in)\s*-?eligible\b|ineligible|barred|\bbar\b|fail|dismiss|blocked|reject|dropped/.test(t)) return "danger";
  if (/warn|probation|at\s*risk|caution|borderline|conditional/.test(t)) return "warning";
  if (/eligible|pass|clear|good|ok\b|okay|allowed|approved|complete|done/.test(t)) return "success";
  return "neutral";
}

export function attendanceTone(text: string | null): Tone {
  if (text === ATTENDANCE_VALUES.PRESENT) return "success";
  if (text === ATTENDANCE_VALUES.ABSENT) return "danger";
  if (text === ATTENDANCE_VALUES.SICK) return "info";
  return "neutral";
}

/** Types whose value is a number stored in `score`. */
export function isNumericType(t: ValueTypeName): boolean {
  return t === "NUMERIC" || t === "COUNT" || t === "PERCENT";
}

const ATTENDANCE_SAMPLE = /^(1|0|s|p|a|present|absent|sick)$/i;
const BOOLEAN_SAMPLE = /^(true|false|yes|no)$/i;
const STATUS_SAMPLE = /eligible|barred|warning|probation/i;

/**
 * Best guess for a newly added column from its title and a few sample values, so "Add all" on an
 * attendance sheet produces sensible types. Faculty can always change it.
 */
export function guessValueType(header: string, samples: string[], context: string[] = []): ValueTypeName {
  const h = header.toLowerCase();
  // A date under the title or an "Attendance" group title above it marks a class session.
  const sessionContext = context.some((c) => /attendance|present\s*=|^\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?$/i.test(c.trim()));
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (values.length && values.every((v) => BOOLEAN_SAMPLE.test(v))) return "BOOLEAN";
  if (/policy|signed|agree|consent|submitted\?|\?$/.test(h) && values.every((v) => BOOLEAN_SAMPLE.test(v) || /^[01]$/.test(v))) return "BOOLEAN";
  if (/%|percent|attd|attendance\s*\(?%/.test(h)) return "PERCENT";
  if (/eligib|status|standing|remark/.test(h) || (values.length && values.every((v) => STATUS_SAMPLE.test(v)))) return "STATUS";
  if (/absen|count|no\.?\s*of|number of|late/.test(h) && values.every((v) => /^\d+$/.test(v))) return "COUNT";
  const sessionTitle = /lab|class|lecture|session|week|day|att/.test(h);
  if (values.every((v) => ATTENDANCE_SAMPLE.test(v)) && (sessionContext || (values.length > 0 && (sessionTitle || values.some((v) => /^[spa]/i.test(v)))))) return "ATTENDANCE";
  return "NUMERIC";
}

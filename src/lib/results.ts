import type { ValueTypeName } from "@/lib/value-types";

/**
 * Client-safe shape of a student's results for one course. Produced by the server for the
 * student page and for the faculty "preview as student" view, so both render identically.
 */
export type ResultStatus = "SCORED" | "MISSING" | "PENDING" | "EXCUSED" | "ABSENT";

export type ResultItem = {
  assessmentId: string;
  name: string;
  kind: "REGULAR" | "OFFICIAL_TOTAL" | "OFFICIAL_GRADE";
  valueType: ValueTypeName;
  maxScore: string | null;
  /** PERCENT: cut-off for good / warning / barred. */
  threshold: string | null;
  status: ResultStatus;
  score: string | null;
  textValue: string | null;
};

export type ResultGroup = { name: string; items: ResultItem[] };

export type CourseResultsView = {
  offeringId: string;
  code: string;
  title: string;
  section: string;
  semester: string;
  instructors: string[];
  /** Optional note from the instructor. */
  description: string | null;
  /** null when nothing is published. */
  publication: { version: number; publishedAt: string } | null;
  groups: ResultGroup[];
  /** Faculty-defined official values (never computed by MarksKoi). */
  official: ResultItem[];
  /** The latest sync failed after this publication; newer updates may be delayed. */
  updatesDelayed: boolean;
  archived: boolean;
};

export const STATUS_LABEL: Record<ResultStatus, string> = {
  SCORED: "Scored",
  MISSING: "Not entered yet",
  PENDING: "Pending",
  EXCUSED: "Excused",
  ABSENT: "Absent",
};

export const STATUS_HELP: Record<ResultStatus, string> = {
  SCORED: "Your mark for this assessment.",
  MISSING: "Your instructor hasn't entered a mark for this yet.",
  PENDING: "Your instructor marked this as pending. Check back later.",
  EXCUSED: "You were excused from this assessment.",
  ABSENT: "Recorded as absent by your instructor.",
};

/** "7.50" → "7.5", "10.00" → "10". */
export function formatScore(value: string | null): string {
  if (value === null) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function groupResultItems(items: Array<ResultItem & { groupName: string; groupOrder: number; displayOrder: number }>): {
  groups: ResultGroup[];
  official: ResultItem[];
} {
  const sorted = [...items].sort((a, b) => a.groupOrder - b.groupOrder || a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  const official = sorted.filter((i) => i.kind !== "REGULAR").map(strip);
  const groups: ResultGroup[] = [];
  for (const item of sorted.filter((i) => i.kind === "REGULAR")) {
    let g = groups.find((x) => x.name === item.groupName);
    if (!g) {
      g = { name: item.groupName, items: [] };
      groups.push(g);
    }
    g.items.push(strip(item));
  }
  return { groups, official };
}

function strip(i: ResultItem & { groupName?: string; groupOrder?: number; displayOrder?: number }): ResultItem {
  return {
    assessmentId: i.assessmentId,
    name: i.name,
    kind: i.kind,
    valueType: i.valueType,
    maxScore: i.maxScore,
    threshold: i.threshold,
    status: i.status,
    score: i.score,
    textValue: i.textValue,
  };
}

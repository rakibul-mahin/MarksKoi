"use client";

import { CheckCircle2, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { formatScore } from "@/lib/results";
import { attendanceTone, percentBand, statusTone, YES, type Tone, type ValueTypeName } from "@/lib/value-types";
import { cn } from "@/lib/utils";
import { IssueList, type IssueLike } from "@/components/kit/issue-list";

export type PreviewResult = {
  ok: boolean;
  problems: Array<{ severity: "error" | "warning"; message: string }>;
  preview: {
    structuralErrors: boolean;
    studentCount: number;
    rowsRead: number;
    issues: IssueLike[];
    issueCount: number;
    assessments: Array<{ id: string; name: string; valueType: ValueTypeName; maxScore: string | null; threshold: string | null }>;
    rows: Array<{ key: string; email: string | null; studentId: string | null; name: string | null; portalAccess: boolean; cells: Record<string, { status: string; value: string | null }> }>;
  } | null;
};

const CELL_LABEL: Record<string, string> = { MISSING: "—", PENDING: "Pending", EXCUSED: "Excused", ABSENT: "Absent", INVALID: "Invalid" };

const TONE_TEXT: Record<Tone, string> = { success: "text-success", warning: "text-warning", danger: "text-destructive", info: "text-info", neutral: "" };

function cellTone(a: { valueType: ValueTypeName; threshold: string | null }, value: string | null): Tone | null {
  switch (a.valueType) {
    case "BOOLEAN":
      return value === YES ? "success" : "danger";
    case "ATTENDANCE":
      return attendanceTone(value);
    case "STATUS":
      return statusTone(value);
    case "PERCENT":
      return percentBand(value, a.threshold)?.tone ?? null;
    default:
      return null;
  }
}

export function PreviewPanel({ result }: { result: PreviewResult }) {
  const p = result.preview;
  const errors = p?.issues.filter((i) => i.severity === "ERROR").length ?? 0;
  const noPortal = p?.rows.filter((r) => !r.portalAccess).length ?? 0;
  return (
    <div id="mapping-preview" className="scroll-mt-20 space-y-4 rounded-lg bg-muted/40 p-4" aria-live="polite">
      {!p ? (
        <p className="flex gap-2 text-sm text-destructive">
          <CircleAlert className="size-4" aria-hidden="true" /> Fix the problems above, then preview again.
        </p>
      ) : (
        <>
          <p className={cn("flex items-start gap-2 text-sm", p.structuralErrors ? "text-destructive" : errors ? "text-warning" : "text-success")}>
            {p.structuralErrors ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : errors ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
            {p.structuralErrors
              ? "This configuration can't be synced yet. See the problems below."
              : `Found ${p.studentCount} students across ${p.rowsRead} rows.${errors ? ` ${errors} rows or cells need attention; they'll keep their previous values.` : " Everything can be synced."}${noPortal ? ` ${noPortal} ${noPortal === 1 ? "student has" : "students have"} no official email, so they can't view marks in SyncScore yet.` : ""}`}
          </p>
          {p.issues.length > 0 && <IssueList issues={p.issues} total={p.issueCount} />}
          {p.rows.length > 0 && (
            <div className="relative overflow-x-auto rounded-lg bg-card ring-1 ring-foreground/10">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Preview of the first {p.rows.length} students</caption>
                <thead>
                  <tr className="border-b border-rule text-xs text-muted-foreground">
                    <th scope="col" className="sticky left-0 bg-card px-3 py-2 font-medium">Student</th>
                    {p.assessments.map((a) => (
                      <th key={a.id} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                        {a.name}
                        {a.valueType === "NUMERIC" && a.maxScore && <span className="tabular block font-normal">/ {formatScore(a.maxScore)}</span>}
                        {a.valueType === "PERCENT" && a.threshold && <span className="tabular block font-normal">threshold {formatScore(a.threshold)}%</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r) => (
                    <tr key={r.key} className="border-b border-rule last:border-0">
                      <th scope="row" className="sticky left-0 max-w-[14rem] bg-card px-3 py-2 text-left font-normal">
                        <span className="block truncate">{r.name ?? r.email ?? `ID ${r.studentId}`}</span>
                        <span className="tabular block truncate text-xs text-muted-foreground">{r.studentId ?? r.email}</span>
                        {!r.portalAccess && (
                          <span className="mt-0.5 inline-block rounded-full bg-warning-soft px-1.5 text-[0.7rem] text-warning" title="No official student email in the sheet. Their marks are synced, but they can't view them in SyncScore yet.">
                            No portal access
                          </span>
                        )}
                      </th>
                      {p.assessments.map((a) => {
                        const c = r.cells[a.id];
                        const scored = c?.status === "SCORED";
                        const tone = scored ? cellTone(a, c.value) : null;
                        return (
                          <td
                            key={a.id}
                            className={cn("tabular whitespace-nowrap px-3 py-2 text-right", !scored && "text-muted-foreground", c?.status === "INVALID" && "bg-danger-soft text-destructive", tone && TONE_TEXT[tone])}
                          >
                            {scored ? (a.valueType === "PERCENT" ? `${formatScore(c.value)}%` : formatScore(c.value)) : CELL_LABEL[c?.status ?? "MISSING"]}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            Blank cells show as “—” (not entered) and are never treated as zero.
          </p>
        </>
      )}
    </div>
  );
}

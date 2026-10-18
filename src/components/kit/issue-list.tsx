import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type IssueLike = {
  severity: "ERROR" | "WARNING" | "INFO";
  code: string;
  message: string;
  worksheetTitle?: string | null;
  rowNumber?: number | null;
  columnHeader?: string | null;
};

const ICON = { ERROR: CircleAlert, WARNING: TriangleAlert, INFO: Info };
const TONE = { ERROR: "text-destructive", WARNING: "text-warning", INFO: "text-info" };

/** Sync / preview problems with worksheet, row and column context. */
export function IssueList({ issues, total }: { issues: IssueLike[]; total?: number }) {
  const sorted = [...issues].sort((a, b) => order(a.severity) - order(b.severity));
  return (
    <div>
      <ul className="divide-y divide-rule overflow-hidden rounded-lg bg-card text-sm ring-1 ring-foreground/10">
        {sorted.map((i, idx) => {
          const Icon = ICON[i.severity];
          return (
            <li key={idx} className="flex gap-3 px-4 py-3">
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[i.severity])} aria-label={i.severity.toLowerCase()} />
              <div className="min-w-0">
                <p>{i.message}</p>
                {(i.worksheetTitle || i.rowNumber || i.columnHeader) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[i.worksheetTitle && `Worksheet “${i.worksheetTitle}”`, i.rowNumber && `row ${i.rowNumber}`, i.columnHeader && `column “${i.columnHeader}”`].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {total !== undefined && total > issues.length && <p className="mt-2 text-xs text-muted-foreground">Showing {issues.length} of {total} problems.</p>}
    </div>
  );
}

function order(s: IssueLike["severity"]) {
  return s === "ERROR" ? 0 : s === "WARNING" ? 1 : 2;
}

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { canEditOffering } from "@/server/authz/permissions";
import { getManagedOffering } from "@/server/services/offerings";
import { getSyncRunIssues, listSyncRuns } from "@/server/services/sync";
import { getSyncSettings } from "@/server/env";
import { isUuid } from "@/lib/ids";
import { SectionHeading } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { IssueList } from "@/components/kit/issue-list";
import { RelativeTime, formatDateTime } from "@/components/kit/relative-time";
import { SyncStatusBadge } from "@/components/kit/status";
import { Pagination } from "@/components/kit/pagination";
import { ActionButtonSync } from "../sync-button";

export const metadata: Metadata = { title: "Sync history" };

const TRIGGER: Record<string, string> = { MANUAL: "Sync now", SCHEDULED: "Scheduled", CONFIG_CHANGE: "After column changes", AUTO: "Automatic (page opened)" };

export default async function SyncPage(props: PageProps<"/faculty/courses/[offeringId]/sync">) {
  const { offeringId } = await props.params;
  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const openRun = typeof sp.run === "string" && isUuid(sp.run) ? sp.run : null;
  const viewer = await requireRole("FACULTY");
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  const { runs, total, pageSize } = await listSyncRuns(viewer, offering.id, page);
  const open = openRun ? await getSyncRunIssues(viewer, offering.id, openRun).catch(() => null) : null;
  const editable = canEditOffering(viewer, facts);
  const base = `/faculty/courses/${offering.id}/sync`;
  const { intervalMinutes } = getSyncSettings();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium">
            Last successful sync: <RelativeTime date={offering.lastSyncSuccessAt} />
          </p>
          <p className="text-muted-foreground">
            {offering.scheduledSync
              ? `SyncScore syncs automatically every ${intervalMinutes} minutes, and whenever you open this course if the last sync is older than that.`
              : "Scheduled syncing is off for this course (see Settings); opening the course still syncs if it's been a while."}{" "}
            Use Sync now for an immediate update. Syncing changes what students see only if auto-publish is on. Otherwise, students see changes when you publish.
          </p>
        </div>
        {editable && offering.sheetSource && <ActionButtonSync offeringId={offering.id} size="default" />}
      </div>

      <section aria-labelledby="runs-heading">
        <SectionHeading title={<span id="runs-heading">History</span>} description={`${total} ${total === 1 ? "sync" : "syncs"}`} />
        {runs.length === 0 ? (
          <EmptyState icon={History} title="No syncs yet">
            Once you save your column choices, SyncScore syncs automatically and each run is listed here with any problems it found.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {runs.map((r) => {
              const isOpen = open?.id === r.id;
              const problems = r.errorCount + r.warningCount;
              return (
                <li key={r.id}>
                  <Link
                    href={isOpen ? `${base}?page=${page}` : `${base}?page=${page}&run=${r.id}`}
                    scroll={false}
                    aria-expanded={isOpen}
                    className="grid grid-cols-1 gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-muted/50 sm:grid-cols-[1.2rem_10rem_1fr_auto] sm:items-center"
                  >
                    <span className="hidden text-muted-foreground sm:block">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span>
                    <span className="text-sm">
                      <RelativeTime date={r.startedAt} className="font-medium" />
                      <span className="block text-xs text-muted-foreground">
                        {TRIGGER[r.trigger]}
                        {r.triggeredBy && ` · ${r.triggeredBy.name ?? r.triggeredBy.email}`}
                      </span>
                    </span>
                    <span className="min-w-0 text-sm text-muted-foreground">
                      {r.summary ?? "In progress…"}
                      {r.autoPublished && <span className="ml-1 text-success">· Republished automatically</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      {problems > 0 && <span className="text-xs text-muted-foreground">{problems} problems</span>}
                      <SyncStatusBadge status={r.status} />
                    </span>
                  </Link>
                  {isOpen && open && (
                    <div className="space-y-3 border-t border-rule bg-muted/30 px-5 py-4">
                      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        {[
                          ["Started", formatDateTime(open.startedAt)],
                          ["Duration", open.durationMs !== null ? `${(open.durationMs / 1000).toFixed(1)} s` : "—"],
                          ["Rows read", open.rowsRead],
                          ["Students matched", open.studentsMatched],
                          ["Marks added", open.marksCreated],
                          ["Marks changed", open.marksUpdated],
                          ["Students added", open.enrollmentsAdded],
                          ["Students removed", open.enrollmentsRemoved],
                        ].map(([k, v]) => (
                          <div key={String(k)}>
                            <dt className="text-xs text-muted-foreground">{k}</dt>
                            <dd className="tabular">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      {open.issues.length > 0 ? (
                        <IssueList issues={open.issues} />
                      ) : (
                        <p className="text-sm text-muted-foreground">No problems were found in this sync.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => `${base}?page=${p}`} />
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listAllSyncRuns, syncHealth } from "@/server/services/admin";
import { PageHeader, SectionHeading } from "@/components/kit/page-header";
import { Pagination } from "@/components/kit/pagination";
import { RelativeTime } from "@/components/kit/relative-time";
import { SyncStatusBadge } from "@/components/kit/status";
import { cn } from "@/lib/utils";
import { RecoverButton } from "./recover-button";

export const metadata: Metadata = { title: "Sync health" };

const FILTERS = [
  ["", "All"],
  ["FAILED", "Failed"],
  ["VALIDATION_FAILED", "Needs review"],
  ["PARTIAL", "With problems"],
  ["RUNNING", "Running"],
  ["SUCCEEDED", "Succeeded"],
] as const;

export default async function SyncRunsPage(props: PageProps<"/admin/sync-runs">) {
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const viewer = await requireRole("ADMIN");
  const [health, { runs, total, pageSize }] = await Promise.all([syncHealth(viewer), listAllSyncRuns(viewer, { status, page })]);
  return (
    <div className="space-y-8">
      <PageHeader title="Sync health" description="Every synchronization across the platform. Failed syncs never change students' published results." />

      {health.stuck.length > 0 && (
        <section aria-labelledby="stuck-heading" className="rounded-xl bg-warning-soft p-5">
          <SectionHeading title={<span id="stuck-heading">Possibly stuck</span>} description="Running for more than five minutes. Leases expire on their own after two minutes; recover only if a course stays blocked." />
          <ul className="space-y-2 text-sm">
            {health.stuck.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3">
                <span className="flex-1">
                  {r.offering.course.code}-{r.offering.section} · started <RelativeTime date={r.startedAt} />
                </span>
                <RecoverButton offeringId={r.offeringId} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="runs-heading" className="space-y-4">
        <h2 id="runs-heading" className="sr-only">All syncs</h2>
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map(([value, label]) => (
            <Link
              key={value}
              href={`/admin/sync-runs${value ? `?status=${value}` : ""}`}
              aria-current={status === value ? "page" : undefined}
              className={cn("rounded-full px-3 py-1 text-sm ring-1 ring-foreground/10", status === value ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="relative overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">When</th>
                <th scope="col" className="px-5 py-3 font-medium">Course</th>
                <th scope="col" className="px-5 py-3 font-medium">Outcome</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-rule align-top last:border-0">
                  <td className="whitespace-nowrap px-5 py-3">
                    <RelativeTime date={r.startedAt} />
                    <span className="block text-xs text-muted-foreground">{r.trigger.toLowerCase().replace("_", " ")}{r.triggeredBy && ` · ${r.triggeredBy.email}`}</span>
                  </td>
                  <td className="px-5 py-3">
                    {r.offering.course.code}-{r.offering.section}
                    <span className="block text-xs text-muted-foreground">{r.offering.title}</span>
                  </td>
                  <td className="max-w-md px-5 py-3 text-muted-foreground">
                    {r.summary ?? "—"}
                    {r.errorCode && <span className="tabular block text-xs">code: {r.errorCode}</span>}
                  </td>
                  <td className="px-5 py-3"><SyncStatusBadge status={r.status} /></td>
                  <td className="px-5 py-3">{r.status === "RUNNING" && <RecoverButton offeringId={r.offeringId} />}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No syncs match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => `/admin/sync-runs?${new URLSearchParams({ status, page: String(p) })}`} />
      </section>
    </div>
  );
}

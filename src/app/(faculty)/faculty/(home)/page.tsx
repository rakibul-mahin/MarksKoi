import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookPlus, CircleAlert, FileSpreadsheet } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { facultyOverview } from "@/server/services/offerings";
import { semesterLabel } from "@/lib/academic";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeading } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { HealthBadge, PublicationBadge } from "@/components/kit/status";
import { RelativeTime } from "@/components/kit/relative-time";
import { describeAuditAction } from "@/components/kit/audit-text";
import { firstNameOf } from "@/lib/names";

export const metadata: Metadata = { title: "Faculty overview" };

const ATTENTION_HINT = {
  needs_setup: "Finish connecting the spreadsheet and mapping columns.",
  attention: "The last sync reported problems. Please review them.",
  stale: "Hasn't synced recently. Run a sync to refresh.",
  ok: "",
} as const;

export default async function FacultyOverview() {
  const viewer = await requireRole("FACULTY");
  const { stats, attention, offerings, recent } = await facultyOverview(viewer);
  const active = offerings.filter((o) => o.status === "ACTIVE").slice(0, 6);

  return (
    <div>
      <PageHeader
        eyebrow="Faculty"
        title={firstNameOf(viewer.name) ? `Welcome back, ${firstNameOf(viewer.name)}` : "Welcome back"}
        description="Your gradebooks stay in Google Sheets. Students see updates only when you publish them."
        actions={
          <Button asChild>
            <Link href="/faculty/courses/new">
              <BookPlus aria-hidden="true" />
              New course
            </Link>
          </Button>
        }
      />

      {stats.total === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Set up your first course"
          action={
            <Button asChild size="lg">
              <Link href="/faculty/courses/new">Create a course</Link>
            </Button>
          }
        >
          It takes about five minutes: create the course, share your marks spreadsheet with SyncScore, choose which columns students should see, then publish when you&apos;re ready.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Active courses", stats.active],
              ["Students enrolled", stats.students],
              ["Published", stats.published],
              ["Needs attention", attention.length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="tabular mt-1 text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          {attention.length > 0 && (
            <section aria-labelledby="attention">
              <SectionHeading title={<span id="attention">Needs your attention</span>} />
              <ul className="divide-y divide-rule overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                {attention.map((o) => (
                  <li key={o.id}>
                    <Link href={`/faculty/courses/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-muted/60">
                      <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">
                          {o.code} · Section {o.section}
                        </span>
                        <span className="block text-sm text-muted-foreground">{ATTENTION_HINT[o.health]}</span>
                      </span>
                      <HealthBadge health={o.health} />
                      <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
            <section aria-labelledby="courses-heading">
              <SectionHeading
                title={<span id="courses-heading">Active courses</span>}
                actions={
                  <Link href="/faculty/courses" className="text-sm font-medium text-primary hover:underline">
                    All courses
                  </Link>
                }
              />
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active courses. Archived courses are listed under All courses.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-3">
                  {active.map((o) => (
                    <li key={o.id}>
                      <Link href={`/faculty/courses/${o.id}`} className="flex min-w-0 items-center gap-4 rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10 transition-shadow hover:ring-primary/30">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="font-display text-lg">{o.code}</span>
                            <span className="text-sm text-muted-foreground">Section {o.section}</span>
                          </span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {semesterLabel(o.season, o.year)} · {o.studentCount} students · synced{" "}
                            <RelativeTime date={o.lastSyncSuccessAt} />
                          </span>
                        </span>
                        <PublicationBadge status={o.publicationStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="activity-heading">
              <SectionHeading title={<span id="activity-heading">Recent activity</span>} />
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Activity on your courses will appear here.</p>
              ) : (
                <ol className="space-y-3">
                  {recent.map((r) => (
                    <li key={r.id} className="text-sm">
                      <p>
                        <span className="font-medium">{r.actor?.name ?? r.actor?.email ?? "SyncScore"}</span> {describeAuditAction(r.action)}
                        {r.offering && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {r.offering.course.code}-{r.offering.section}
                          </span>
                        )}
                      </p>
                      <RelativeTime date={r.createdAt} className="text-xs text-muted-foreground" />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

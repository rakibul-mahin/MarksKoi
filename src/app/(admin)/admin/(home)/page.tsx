import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { adminOverview, syncHealth } from "@/server/services/admin";
import { PageHeader, SectionHeading } from "@/components/kit/page-header";
import { RelativeTime } from "@/components/kit/relative-time";
import { SyncStatusBadge } from "@/components/kit/status";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminHome() {
  const viewer = await requireRole("ADMIN");
  const [o, health] = await Promise.all([adminOverview(viewer), syncHealth(viewer)]);
  const tiles: Array<[string, number, string]> = [
    ["People", o.users, "/admin/users"],
    ["Faculty", o.faculty, "/admin/users"],
    ["Active courses", o.activeOfferings, "/admin/courses"],
    ["Syncs in 24 h", o.runs24h, "/admin/sync-runs"],
  ];
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Administration" title="Platform overview" description="Access, course assignments and synchronization health. Student marks are not shown to administrators." />
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, href]) => (
          <Link key={label} href={href} className="rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10 transition-shadow hover:ring-primary/30">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{value}</dd>
          </Link>
        ))}
      </dl>
      <section aria-labelledby="failing-heading">
        <SectionHeading
          title={<span id="failing-heading">Courses with sync problems</span>}
          description={`${o.failing} failing · ${health.stuck.length} stuck`}
          actions={
            <Link href="/admin/sync-runs" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Sync health <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        />
        {health.failing.length === 0 ? (
          <p className="rounded-xl bg-card px-5 py-4 text-sm text-muted-foreground ring-1 ring-foreground/10">All active courses synced without problems.</p>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {health.failing.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {f.course.code}-{f.section}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {f.title} · last attempt <RelativeTime date={f.lastSyncAttemptAt} />
                  </span>
                </span>
                <SyncStatusBadge status={f.lastSyncStatus} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

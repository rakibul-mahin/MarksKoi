import type { Metadata } from "next";
import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { getAppUrl } from "@/server/env";
import { getManagedOffering } from "@/server/services/offerings";
import { spreadsheetUrl } from "@/server/sheets/spreadsheet-id";
import { Button } from "@/components/ui/button";
import { ActionButtonSync } from "./sync-button";
import { CopyButton } from "@/components/kit/copy-button";
import { RelativeTime } from "@/components/kit/relative-time";
import { SectionHeading } from "@/components/kit/page-header";
import { SyncStatusBadge } from "@/components/kit/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Course overview" };

export default async function CourseOverview(props: PageProps<"/faculty/courses/[offeringId]">) {
  const { offeringId } = await props.params;
  const viewer = await requireRole("FACULTY");
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  const [assessmentCount, studentCount, lastRun, activeSnapshot] = await Promise.all([
    db.assessment.count({ where: { offeringId: offering.id, archivedAt: null } }),
    db.enrollment.count({ where: { offeringId: offering.id, status: "ACTIVE" } }),
    db.syncRun.findFirst({ where: { offeringId: offering.id }, orderBy: { startedAt: "desc" } }),
    db.publicationSnapshot.findFirst({ where: { offeringId: offering.id, status: "ACTIVE" }, select: { version: true, createdAt: true } }),
  ]);
  const base = `/faculty/courses/${offering.id}`;
  const studentLink = `${getAppUrl()}/courses/${offering.id}`;
  const steps = [
    { done: !!offering.sheetSource, title: "Connect your spreadsheet", body: "Share your marks sheet with MarksKoi and paste its link.", href: `${base}/assessments`, cta: "Connect" },
    { done: assessmentCount > 0, title: "Choose the columns students see", body: "Pick the class list and the assessment columns.", href: `${base}/assessments`, cta: "Choose columns" },
    { done: !!offering.lastSyncSuccessAt, title: "Sync marks", body: "Copy the latest marks into MarksKoi. Nothing is visible to students yet.", href: `${base}/sync`, cta: "Open sync" },
    { done: !!activeSnapshot, title: "Publish", body: "Preview exactly what students will see, then publish.", href: `${base}/publish`, cta: "Review & publish" },
  ];
  const nextStep = steps.findIndex((s) => !s.done);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
      <section aria-labelledby="setup-heading">
        <SectionHeading title={<span id="setup-heading">{nextStep === -1 ? "Setup complete" : "Setup"}</span>} description={nextStep === -1 ? "Keep your sheet up to date; sync and republish whenever marks change." : "Four steps. Students see nothing until the last one."} />
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className={cn("flex gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10", i === nextStep && "ring-2 ring-primary/40")}>
              <span className={cn("tabular grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold", s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {s.done ? <Check className="size-4" aria-label="Done" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
              {i === nextStep && !facts.archived && (
                <Button asChild size="sm" className="self-center">
                  <Link href={s.href}>{s.cta}</Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="space-y-6">
        <section aria-labelledby="facts-heading" className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 id="facts-heading" className="sr-only">Course facts</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted-foreground">Students</dt>
              <dd className="tabular text-xl font-semibold">{studentCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Assessments</dt>
              <dd className="tabular text-xl font-semibold">{assessmentCount}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Last sync</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <SyncStatusBadge status={lastRun?.status ?? null} />
                {lastRun && <RelativeTime date={lastRun.startedAt} className="text-muted-foreground" />}
              </dd>
              {lastRun?.summary && <dd className="mt-1 text-sm text-muted-foreground">{lastRun.summary}</dd>}
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Published to students</dt>
              <dd className="text-sm">{activeSnapshot ? <>Version {activeSnapshot.version}, <RelativeTime date={activeSnapshot.createdAt} /></> : "Not published"}</dd>
            </div>
          </dl>
          {offering.sheetSource && !facts.archived && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-rule pt-4">
              <ActionButtonSync offeringId={offering.id} />
              <Button asChild variant="outline" size="sm">
                <a href={spreadsheetUrl(offering.sheetSource.spreadsheetId)} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Open spreadsheet
                </a>
              </Button>
            </div>
          )}
        </section>

        <section aria-labelledby="link-heading" className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 id="link-heading" className="text-sm font-semibold">Student link</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enrolled students can open this link. It never changes, even if you replace the spreadsheet.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="tabular min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs">{studentLink}</code>
            <CopyButton value={studentLink} />
          </div>
        </section>
      </div>
    </div>
  );
}

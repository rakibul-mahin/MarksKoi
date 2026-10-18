import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { AppError } from "@/server/errors";
import { getManagedOffering } from "@/server/services/offerings";
import { semesterLabel } from "@/lib/academic";
import { PublicationBadge, StatusPill, SyncStatusBadge } from "@/components/kit/status";
import { canEditOffering } from "@/server/authz/permissions";
import { isSyncDue } from "@/server/services/sync";
import { CourseTabs } from "./course-tabs";
import { AutoSync } from "./auto-sync";

export default async function CourseLayout(props: LayoutProps<"/faculty/courses/[offeringId]">) {
  const { offeringId } = await props.params;
  const viewer = await requireRole("FACULTY");
  let access;
  try {
    access = await getManagedOffering(viewer, offeringId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { offering, facts } = access;
  const autoSyncDue = canEditOffering(viewer, facts) && !!offering.sheetSource && isSyncDue(offering.lastSyncAttemptAt);
  return (
    <div>
      <Link href="/faculty/courses" className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Courses
      </Link>
      <header className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {semesterLabel(offering.semester.season, offering.semester.year)} · Section {offering.section}
          </p>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-[2rem] leading-tight tracking-tight">{offering.course.code}</span>
            <span className="text-lg text-muted-foreground">{offering.title}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoSync offeringId={offering.id} due={autoSyncDue} />
          {offering.status === "ARCHIVED" && <StatusPill tone="neutral">Archived</StatusPill>}
          <SyncStatusBadge status={offering.lastSyncStatus} />
          <PublicationBadge status={offering.publicationStatus} />
        </div>
      </header>
      <CourseTabs offeringId={offering.id} />
      <div className="pt-6">{props.children}</div>
    </div>
  );
}

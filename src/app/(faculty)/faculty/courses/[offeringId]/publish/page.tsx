import type { Metadata } from "next";
import { Globe2, TriangleAlert } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { getPublicationOverview, listRosterForPreview, previewAsStudent } from "@/server/services/publication";
import { isUuid } from "@/lib/ids";
import { SectionHeading } from "@/components/kit/page-header";
import { RelativeTime, formatDateTime } from "@/components/kit/relative-time";
import { StatusPill } from "@/components/kit/status";
import { CourseResults } from "@/components/results/course-results";
import { EmptyState } from "@/components/kit/empty-state";
import { PublishForm } from "./publish-form";
import { PreviewControls } from "./preview-controls";

export const metadata: Metadata = { title: "Publish & preview" };

export default async function PublishPage(props: PageProps<"/faculty/courses/[offeringId]/publish">) {
  const { offeringId } = await props.params;
  const sp = await props.searchParams;
  const viewer = await requireRole("FACULTY");
  const overview = await getPublicationOverview(viewer, offeringId);
  const { offering, active, history, lastRun, pendingChanges, canPublish } = overview;
  const roster = await listRosterForPreview(viewer, offering.id);

  const selectedFromUrl = typeof sp.a === "string" ? sp.a.split(",").filter(isUuid) : null;
  const defaultSelection = active ? active.assessments.map((a) => a.assessmentId) : overview.assessments.map((a) => a.id);
  const selection = selectedFromUrl ?? defaultSelection;
  const mode = sp.mode === "published" ? "published" : "draft";
  const studentId = typeof sp.student === "string" && roster.some((r) => r.id === sp.student) ? sp.student : roster[0]?.id;
  const preview = studentId ? await previewAsStudent(viewer, offering.id, { enrollmentId: studentId, mode, assessmentIds: selection }) : null;

  const groups = new Map<string, Array<{ id: string; name: string; scored: number }>>();
  for (const a of overview.assessments) {
    groups.set(a.group.name, [...(groups.get(a.group.name) ?? []), { id: a.id, name: a.name, scored: a._count.marks }]);
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="live-heading" className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 id="live-heading" className="sr-only">What students see now</h2>
        {active ? (
          <div className="flex flex-wrap items-start gap-4">
            <span className="grid size-10 place-items-center rounded-full bg-success-soft text-success">
              <Globe2 className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                Students see version {active.version}, with {active.assessments.length} {active.assessments.length === 1 ? "assessment" : "assessments"}
              </p>
              <p className="text-muted-foreground">
                Published <RelativeTime date={active.createdAt} /> by {active.publishedBy?.name ?? active.publishedBy?.email ?? "automatic republish"}.
              </p>
              {pendingChanges !== null && pendingChanges > 0 && (
                <p className="mt-2 text-warning">
                  {pendingChanges} {pendingChanges === 1 ? "mark has" : "marks have"} changed since then. Students won&apos;t see the changes until you publish again.
                </p>
              )}
              {pendingChanges === 0 && <p className="mt-2 text-success">Students see your latest synced marks.</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing is published. Students in this course see “No results published yet”.</p>
        )}
        {lastRun && (lastRun.status === "PARTIAL" || lastRun.status === "VALIDATION_FAILED" || lastRun.status === "FAILED") && (
          <p className="mt-4 flex gap-2 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            The latest sync reported problems ({lastRun.summary}). Affected cells kept their previous values, so check Sync history before publishing.
          </p>
        )}
      </section>

      {overview.assessments.length === 0 ? (
        <EmptyState icon={Globe2} title="Nothing to publish yet">
          Choose assessment columns and sync your spreadsheet first.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <section aria-labelledby="publish-heading">
            <SectionHeading title={<span id="publish-heading">Choose what students see</span>} description="Unchecked assessments stay hidden." />
            <PublishForm
              offeringId={offering.id}
              canPublish={canPublish}
              hasActive={!!active}
              enrollmentCount={overview.enrollmentCount}
              groups={[...groups.entries()].map(([name, items]) => ({ name, items }))}
              initialSelection={selection}
            />
          </section>
          <section aria-labelledby="preview-heading" className="min-w-0">
            <SectionHeading title={<span id="preview-heading">Preview as a student</span>} description="Exactly what the selected student will see." />
            {roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students yet. Sync your class list first.</p>
            ) : (
              <>
                <PreviewControls roster={roster.map((r) => ({ id: r.id, label: `${r.sourceName ?? r.sourceEmail ?? "Student"}${r.sourceStudentId ? ` · ${r.sourceStudentId}` : ""}${r.studentProfileId ? "" : " · no portal access"}` }))} studentId={studentId!} mode={mode} />
                <div className="mt-4 rounded-2xl border border-dashed p-4 sm:p-6">{preview && <CourseResults view={preview} preview={mode} />}</div>
              </>
            )}
          </section>
        </div>
      )}

      {history.length > 0 && (
        <section aria-labelledby="history-heading">
          <SectionHeading title={<span id="history-heading">Publication history</span>} />
          <ul className="divide-y divide-rule overflow-hidden rounded-xl bg-card text-sm ring-1 ring-foreground/10">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="tabular font-medium">v{h.version}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {formatDateTime(h.createdAt)} · {h.publishedBy?.name ?? h.publishedBy?.email ?? "Automatic"} · {h.assessments.length} assessments, {h._count.marks} marks
                  {h.note && ` · “${h.note}”`}
                </span>
                <StatusPill tone={h.status === "ACTIVE" ? "success" : h.status === "WITHDRAWN" ? "danger" : "neutral"}>
                  {h.status === "ACTIVE" ? "Live" : h.status === "WITHDRAWN" ? "Unpublished" : "Replaced"}
                </StatusPill>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

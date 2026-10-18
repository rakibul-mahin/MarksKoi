import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guards";
import { canAdministerOffering, canEditOffering } from "@/server/authz/permissions";
import { db } from "@/server/db";
import { deletionConfirmationText, getManagedOffering } from "@/server/services/offerings";
import { SectionHeading } from "@/components/kit/page-header";
import { SettingsForm } from "./settings-form";
import { CoInstructors } from "./co-instructors";
import { ArchiveControls } from "./archive-controls";
import { DeleteCourse } from "./delete-course";

export const metadata: Metadata = { title: "Course settings" };

export default async function SettingsPage(props: PageProps<"/faculty/courses/[offeringId]/settings">) {
  const { offeringId } = await props.params;
  const viewer = await requireRole("FACULTY");
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  const isOwner = canAdministerOffering(viewer, facts);
  const studentCount = isOwner ? await db.enrollment.count({ where: { offeringId: offering.id, status: "ACTIVE" } }) : 0;
  return (
    <div className="max-w-3xl space-y-10">
      <section aria-labelledby="details-heading">
        <SectionHeading title={<span id="details-heading">Course details</span>} description={`Course code ${offering.course.code} and semester are fixed. The link students use never changes.`} />
        <SettingsForm
          offeringId={offering.id}
          editable={canEditOffering(viewer, facts)}
          defaults={{
            title: offering.title,
            section: offering.section,
            description: offering.description ?? "",
            autoPublish: offering.autoPublish,
            scheduledSync: offering.scheduledSync,
          }}
        />
      </section>

      <section aria-labelledby="team-heading">
        <SectionHeading title={<span id="team-heading">Instructors</span>} description="Co-instructors can sync, change columns and publish. Only the owner can add or remove instructors and archive the course." />
        <CoInstructors
          offeringId={offering.id}
          canManage={isOwner && !facts.archived}
          viewerId={viewer.profileId}
          members={offering.faculty.map((f) => ({ profileId: f.profileId, name: f.profile.name, email: f.profile.email, role: f.role }))}
        />
      </section>

      <section aria-labelledby="archive-heading">
        <SectionHeading title={<span id="archive-heading">{facts.archived ? "Restore course" : "Archive course"}</span>} />
        <ArchiveControls offeringId={offering.id} archived={facts.archived} isOwner={isOwner} />
      </section>

      <section aria-labelledby="delete-heading">
        <SectionHeading title={<span id="delete-heading" className="text-destructive">Delete course</span>} />
        {isOwner ? (
          <DeleteCourse offeringId={offering.id} confirmText={deletionConfirmationText(offering)} studentCount={studentCount} published={offering.publicationStatus === "PUBLISHED"} />
        ) : (
          <p className="text-sm text-muted-foreground">Only the course owner can delete this course.</p>
        )}
      </section>
    </div>
  );
}

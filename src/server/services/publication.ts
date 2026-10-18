import "server-only";
import { z } from "zod";
import { isUuid } from "@/lib/ids";
import { canPublishOffering, type Viewer } from "../authz/permissions";
import { db } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { parseInput } from "../validation";
import { recordAudit } from "./audit";
import { getManagedOffering } from "./offerings";
import { createSnapshot, withdrawActiveSnapshot } from "./publication-core";
import { buildResultsView } from "./student";

export async function getPublicationOverview(viewer: Viewer, offeringId: unknown) {
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  const [assessments, snapshots, lastRun, enrollmentCount] = await Promise.all([
    db.assessment.findMany({
      where: { offeringId: offering.id, archivedAt: null },
      include: { group: true, _count: { select: { marks: { where: { status: "SCORED" } } } } },
      orderBy: [{ group: { displayOrder: "asc" } }, { displayOrder: "asc" }],
    }),
    db.publicationSnapshot.findMany({
      where: { offeringId: offering.id },
      orderBy: { version: "desc" },
      take: 10,
      include: {
        publishedBy: { select: { name: true, email: true } },
        withdrawnBy: { select: { name: true, email: true } },
        assessments: { select: { assessmentId: true, name: true } },
        _count: { select: { marks: true } },
      },
    }),
    db.syncRun.findFirst({ where: { offeringId: offering.id, status: { not: "RUNNING" } }, orderBy: { startedAt: "desc" } }),
    db.enrollment.count({ where: { offeringId: offering.id, status: "ACTIVE" } }),
  ]);
  const active = snapshots.find((s) => s.status === "ACTIVE") ?? null;
  const pendingChanges = active ? await countPendingChanges(offering.id, active.id, active.assessments.map((a) => a.assessmentId)) : null;
  return {
    offering,
    canPublish: canPublishOffering(viewer, facts),
    assessments,
    active,
    history: snapshots,
    lastRun,
    enrollmentCount,
    pendingChanges,
  };
}

/** Marks that differ between the working copy and the active snapshot (incl. roster changes). */
async function countPendingChanges(offeringId: string, snapshotId: string, assessmentIds: string[]): Promise<number> {
  if (assessmentIds.length === 0) return 0;
  const rows = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT
      (SELECT count(*) FROM marks m
         JOIN enrollments e ON e.id = m.enrollment_id AND e.status = 'ACTIVE'
         LEFT JOIN published_marks pm
           ON pm.snapshot_id = ${snapshotId}::uuid AND pm.enrollment_id = m.enrollment_id AND pm.assessment_id = m.assessment_id
        WHERE m.offering_id = ${offeringId}::uuid
          AND m.assessment_id = ANY(${assessmentIds}::uuid[])
          AND (pm.id IS NULL OR pm.status <> m.status OR pm.score IS DISTINCT FROM m.score OR pm.text_value IS DISTINCT FROM m.text_value))
      +
      (SELECT count(*) FROM published_marks pm
         JOIN enrollments e ON e.id = pm.enrollment_id AND e.status = 'REMOVED'
        WHERE pm.snapshot_id = ${snapshotId}::uuid) AS n`;
  return Number(rows[0]?.n ?? 0);
}

const publishSchema = z.object({
  assessmentIds: z.array(z.string().uuid()).min(1, "Choose at least one assessment to publish.").max(300),
  note: z.string().trim().max(500).optional(),
});

export async function publishResults(viewer: Viewer, offeringId: unknown, raw: unknown) {
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  if (!canPublishOffering(viewer, facts)) {
    throw new AppError("FORBIDDEN", facts.archived ? "This course is archived. Restore it before publishing." : "You can't publish results for this course.");
  }
  const input = parseInput(publishSchema, raw);
  const lastRun = await db.syncRun.findFirst({ where: { offeringId: offering.id, status: { in: ["SUCCEEDED", "PARTIAL"] } }, orderBy: { startedAt: "desc" } });
  if (!lastRun) throw new AppError("VALIDATION", "Sync the spreadsheet at least once before publishing.");
  return db.$transaction(async (tx) => {
    const result = await createSnapshot(tx, {
      offeringId: offering.id,
      assessmentIds: input.assessmentIds,
      actorId: viewer.profileId,
      sourceSyncRunId: lastRun.id,
      note: input.note ?? null,
    });
    await recordAudit(tx, {
      actorId: viewer.profileId,
      action: "publication.published",
      entityType: "publication_snapshot",
      entityId: result.snapshotId,
      offeringId: offering.id,
      metadata: { version: result.version, assessments: input.assessmentIds.length, marks: result.markCount },
    });
    return result;
  });
}

export async function unpublishResults(viewer: Viewer, offeringId: unknown) {
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  if (!canPublishOffering(viewer, facts)) throw forbidden("You can't change publication for this course.");
  return db.$transaction(async (tx) => {
    const version = await withdrawActiveSnapshot(tx, offering.id, viewer.profileId);
    await recordAudit(tx, {
      actorId: viewer.profileId,
      action: "publication.unpublished",
      entityType: "offering",
      entityId: offering.id,
      offeringId: offering.id,
      metadata: { version },
    });
    return { version };
  });
}

/** Faculty: list roster students for the preview picker. */
export async function listRosterForPreview(viewer: Viewer, offeringId: unknown) {
  const { offering } = await getManagedOffering(viewer, offeringId);
  return db.enrollment.findMany({
    where: { offeringId: offering.id, status: "ACTIVE" },
    select: { id: true, studentProfileId: true, sourceName: true, sourceStudentId: true, sourceEmail: true, sourceRow: true },
    orderBy: [{ sourceRow: "asc" }],
  });
}

/**
 * Faculty "view as student": renders exactly what the chosen student would see, either the live
 * published snapshot or a draft built from current synced marks for the chosen assessments.
 */
export async function previewAsStudent(viewer: Viewer, offeringId: unknown, input: { enrollmentId: unknown; mode: "draft" | "published"; assessmentIds?: string[] }) {
  const { offering } = await getManagedOffering(viewer, offeringId);
  if (!isUuid(input.enrollmentId)) throw notFound("Student");
  const enrollment = await db.enrollment.findFirst({ where: { id: input.enrollmentId, offeringId: offering.id }, select: { id: true } });
  if (!enrollment) throw notFound("Student");
  if (input.mode === "published") return buildResultsView(offering.id, { kind: "published", enrollmentId: enrollment.id });
  const ids = (input.assessmentIds ?? []).filter(isUuid);
  const assessmentIds = input.assessmentIds
    ? ids
    : (await db.assessment.findMany({ where: { offeringId: offering.id, archivedAt: null }, select: { id: true } })).map((a) => a.id);
  return buildResultsView(offering.id, { kind: "draft", enrollmentId: enrollment.id, assessmentIds });
}

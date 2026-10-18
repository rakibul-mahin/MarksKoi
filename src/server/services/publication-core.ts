import "server-only";
import type { Tx } from "../db";
import { AppError } from "../errors";

/**
 * Snapshot primitives. Callers are responsible for authorization; these run inside a
 * transaction supplied by the caller so publishing is atomic with whatever triggered it.
 */

/** Serializes publication changes for one offering (row lock on the offering). */
export async function lockOffering(tx: Tx, offeringId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM course_offerings WHERE id = ${offeringId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new AppError("NOT_FOUND", "Course offering not found.");
}

/**
 * Creates a new ACTIVE snapshot from the current working-copy marks for the given assessments.
 * The previous ACTIVE snapshot becomes SUPERSEDED. Only ACTIVE enrollments are included.
 */
export async function createSnapshot(
  tx: Tx,
  input: { offeringId: string; assessmentIds: string[]; actorId: string | null; sourceSyncRunId?: string | null; note?: string | null },
): Promise<{ snapshotId: string; version: number; markCount: number }> {
  await lockOffering(tx, input.offeringId);
  const ids = [...new Set(input.assessmentIds)];
  if (ids.length === 0) throw new AppError("VALIDATION", "Choose at least one assessment to publish.");

  const assessments = await tx.assessment.findMany({
    where: { id: { in: ids }, offeringId: input.offeringId, archivedAt: null },
    include: { group: true },
  });
  if (assessments.length !== ids.length) {
    throw new AppError("VALIDATION", "Some selected assessments don't belong to this course or are archived.");
  }

  const last = await tx.publicationSnapshot.aggregate({ where: { offeringId: input.offeringId }, _max: { version: true } });
  const version = (last._max.version ?? 0) + 1;

  await tx.publicationSnapshot.updateMany({
    where: { offeringId: input.offeringId, status: "ACTIVE" },
    data: { status: "SUPERSEDED" },
  });
  const snapshot = await tx.publicationSnapshot.create({
    data: {
      offeringId: input.offeringId,
      version,
      status: "ACTIVE",
      publishedById: input.actorId,
      sourceSyncRunId: input.sourceSyncRunId ?? null,
      note: input.note ?? null,
    },
  });
  await tx.publishedAssessment.createMany({
    data: assessments.map((a) => ({
      snapshotId: snapshot.id,
      assessmentId: a.id,
      name: a.name,
      groupName: a.group.name,
      groupOrder: a.group.displayOrder,
      displayOrder: a.displayOrder,
      maxScore: a.maxScore,
      valueType: a.valueType,
      threshold: a.threshold,
      kind: a.kind,
    })),
  });
  const markCount = await tx.$executeRaw`
    INSERT INTO published_marks (id, snapshot_id, enrollment_id, assessment_id, status, score, text_value)
    SELECT gen_random_uuid(), ${snapshot.id}::uuid, m.enrollment_id, m.assessment_id, m.status, m.score, m.text_value
    FROM marks m
    JOIN enrollments e ON e.id = m.enrollment_id
    WHERE m.offering_id = ${input.offeringId}::uuid
      AND e.status = 'ACTIVE'
      AND m.assessment_id = ANY(${ids}::uuid[])`;

  await tx.courseOffering.update({ where: { id: input.offeringId }, data: { publicationStatus: "PUBLISHED" } });
  return { snapshotId: snapshot.id, version, markCount };
}

export async function withdrawActiveSnapshot(tx: Tx, offeringId: string, actorId: string | null): Promise<number | null> {
  await lockOffering(tx, offeringId);
  const active = await tx.publicationSnapshot.findFirst({ where: { offeringId, status: "ACTIVE" } });
  if (active) {
    await tx.publicationSnapshot.update({
      where: { id: active.id },
      data: { status: "WITHDRAWN", withdrawnAt: new Date(), withdrawnById: actorId },
    });
  }
  await tx.courseOffering.update({ where: { id: offeringId }, data: { publicationStatus: "UNPUBLISHED" } });
  return active?.version ?? null;
}

/** Assessment ids in the active snapshot, or null when nothing is published. */
export async function activeSnapshotAssessmentIds(tx: Tx, offeringId: string): Promise<string[] | null> {
  const active = await tx.publicationSnapshot.findFirst({
    where: { offeringId, status: "ACTIVE" },
    select: { assessments: { select: { assessmentId: true } } },
  });
  return active ? active.assessments.map((a) => a.assessmentId) : null;
}

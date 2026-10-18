import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isUuid } from "@/lib/ids";
import { normalizeEmail } from "@/lib/normalize";
import { semesterSortKey } from "@/lib/academic";
import { offeringInputSchema, offeringUpdateSchema } from "@/lib/schemas";
import { canAdministerOffering, canEditOffering, canManageOffering, hasRole, type OfferingFacts, type Viewer } from "../authz/permissions";
import { classifyEmail } from "../auth/domain-policy";
import { db } from "../db";
import { getDomainPolicyConfig, getSyncSettings } from "../env";
import { AppError, forbidden, notFound } from "../errors";
import { parseInput } from "../validation";
import { acquireLease } from "../sync/lease";
import { recordAudit } from "./audit";

export { offeringInputSchema, offeringUpdateSchema };

/**
 * Loads an offering the viewer manages. Offerings the viewer is not assigned to are reported as
 * "not found" so their existence isn't revealed.
 */
export async function getManagedOffering(viewer: Viewer, offeringId: unknown) {
  if (!isUuid(offeringId)) throw notFound("Course");
  const offering = await db.courseOffering.findUnique({
    where: { id: offeringId },
    include: {
      course: true,
      semester: true,
      faculty: { include: { profile: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
      sheetSource: true,
    },
  });
  if (!offering) throw notFound("Course");
  const mine = offering.faculty.find((f) => f.profileId === viewer.profileId);
  const facts: OfferingFacts = { facultyRole: mine?.role ?? null, archived: offering.status === "ARCHIVED" };
  if (!canManageOffering(viewer, facts)) throw notFound("Course");
  return { offering, facts };
}

export async function requireEditableOffering(viewer: Viewer, offeringId: unknown) {
  const access = await getManagedOffering(viewer, offeringId);
  if (!canEditOffering(viewer, access.facts)) {
    throw new AppError("FORBIDDEN", access.facts.archived ? "This course is archived. Restore it to make changes." : "You can't edit this course.");
  }
  return access;
}

export async function createOffering(viewer: Viewer, raw: unknown) {
  if (!hasRole(viewer, "FACULTY")) throw forbidden("Only faculty can create courses.");
  const input = parseInput(offeringInputSchema, raw);
  try {
    return await db.$transaction(async (tx) => {
      const semester = await tx.semester.upsert({
        where: { season_year: { season: input.season, year: input.year } },
        update: {},
        create: { season: input.season, year: input.year },
      });
      const course = await tx.course.upsert({
        where: { code: input.courseCode },
        update: {},
        create: { code: input.courseCode, title: input.courseTitle },
      });
      const offering = await tx.courseOffering.create({
        data: {
          courseId: course.id,
          semesterId: semester.id,
          section: input.section,
          title: input.courseTitle,
          description: input.description,
          createdById: viewer.profileId,
          faculty: { create: { profileId: viewer.profileId, role: "OWNER", addedById: viewer.profileId } },
        },
      });
      await recordAudit(tx, {
        actorId: viewer.profileId,
        action: "offering.created",
        entityType: "offering",
        entityId: offering.id,
        offeringId: offering.id,
        metadata: { code: input.courseCode, season: input.season, year: input.year, section: input.section },
      });
      return offering;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(
        "CONFLICT",
        `${input.courseCode} section ${input.section} already exists for this semester. Ask its instructor to add you as a co-instructor.`,
        { fieldErrors: { section: "This section already exists." } },
      );
    }
    throw err;
  }
}

export async function updateOffering(viewer: Viewer, offeringId: unknown, raw: unknown) {
  const { offering } = await requireEditableOffering(viewer, offeringId);
  const input = parseInput(offeringUpdateSchema, raw);
  try {
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.courseOffering.update({
        where: { id: offering.id },
        data: {
          title: input.title,
          section: input.section,
          description: input.description,
          autoPublish: input.autoPublish,
          scheduledSync: input.scheduledSync,
        },
      });
      await recordAudit(tx, {
        actorId: viewer.profileId,
        action: "offering.updated",
        entityType: "offering",
        entityId: offering.id,
        offeringId: offering.id,
        metadata: { fields: Object.keys(input) },
      });
      return result;
    });
    return updated;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("CONFLICT", "Another offering already uses that section.", { fieldErrors: { section: "Already in use." } });
    }
    throw err;
  }
}

export async function setArchived(viewer: Viewer, offeringId: unknown, archived: boolean) {
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  if (!canAdministerOffering(viewer, facts)) throw forbidden("Only the course owner can archive or restore it.");
  await db.$transaction(async (tx) => {
    await tx.courseOffering.update({
      where: { id: offering.id },
      data: { status: archived ? "ARCHIVED" : "ACTIVE", archivedAt: archived ? new Date() : null },
    });
    await recordAudit(tx, {
      actorId: viewer.profileId,
      action: archived ? "offering.archived" : "offering.restored",
      entityType: "offering",
      entityId: offering.id,
      offeringId: offering.id,
    });
  });
}

/** The text an owner must type to confirm permanent deletion, e.g. "CSE110-01". */
export function deletionConfirmationText(o: { course: { code: string }; section: string }): string {
  return `${o.course.code}-${o.section}`;
}

/**
 * Permanently deletes a course offering and all of its academic data (enrollments, synced marks,
 * publications, sync history, spreadsheet mapping). Owner only, requires typing the course
 * name, and refuses while a sync is running. Student profiles, the Google Sheet itself and the
 * audit trail are kept; a final audit entry records what was deleted and by whom.
 */
export async function deleteOffering(viewer: Viewer, offeringId: unknown, confirmation: unknown) {
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  if (!canAdministerOffering(viewer, facts)) throw forbidden("Only the course owner can delete it.");
  const expected = deletionConfirmationText(offering);
  if (typeof confirmation !== "string" || confirmation.trim().toUpperCase() !== expected.toUpperCase()) {
    throw new AppError("VALIDATION", `Type ${expected} exactly to confirm.`, { fieldErrors: { confirmation: `Type ${expected} to confirm.` } });
  }
  // Hold the sync lease so no sync can write into the course while it is being deleted.
  const token = await acquireLease(db, offering.id);
  if (!token) throw new AppError("SYNC_IN_PROGRESS", "A sync is running for this course. Try again in a minute.");

  const counts = await db.$transaction(
    async (tx) => {
      const id = offering.id;
      const [students, marks, snapshots] = await Promise.all([
        tx.enrollment.count({ where: { offeringId: id } }),
        tx.mark.count({ where: { offeringId: id } }),
        tx.publicationSnapshot.count({ where: { offeringId: id } }),
      ]);
      // Children first: published rows reference enrollments/assessments with RESTRICT on purpose.
      await tx.publishedMark.deleteMany({ where: { snapshot: { offeringId: id } } });
      await tx.publishedAssessment.deleteMany({ where: { snapshot: { offeringId: id } } });
      await tx.publicationSnapshot.deleteMany({ where: { offeringId: id } });
      await tx.mark.deleteMany({ where: { offeringId: id } });
      await tx.syncRun.deleteMany({ where: { offeringId: id } }); // sync_errors cascade
      await tx.assessmentColumn.deleteMany({ where: { assessment: { offeringId: id } } });
      await tx.assessment.deleteMany({ where: { offeringId: id } });
      await tx.assessmentGroup.deleteMany({ where: { offeringId: id } });
      await tx.sheetSource.deleteMany({ where: { offeringId: id } }); // worksheets cascade
      await tx.enrollment.deleteMany({ where: { offeringId: id } });
      await tx.courseFaculty.deleteMany({ where: { offeringId: id } });
      await tx.courseOffering.delete({ where: { id } }); // earlier audit rows keep entity_id; offering_id → NULL
      const summary = {
        code: offering.course.code,
        section: offering.section,
        semester: `${offering.semester.season} ${offering.semester.year}`,
        title: offering.title,
        students,
        marks,
        publications: snapshots,
      };
      await recordAudit(tx, { actorId: viewer.profileId, action: "offering.deleted", entityType: "offering", entityId: id, offeringId: null, metadata: summary });
      return summary;
    },
    { timeout: 30_000 },
  );
  return counts;
}

export async function addCoInstructor(viewer: Viewer, offeringId: unknown, rawEmail: unknown) {
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  if (!canAdministerOffering(viewer, facts) || facts.archived) throw forbidden("Only the course owner can add co-instructors.");
  const email = normalizeEmail(rawEmail);
  const decision = email ? classifyEmail(email, getDomainPolicyConfig()) : null;
  if (!email || !decision?.ok || decision.role !== "FACULTY") {
    throw new AppError("VALIDATION", "Enter a faculty university email address.", { fieldErrors: { email: "Must be a faculty email." } });
  }
  await db.$transaction(async (tx) => {
    const profile = await tx.profile.upsert({ where: { email }, update: {}, create: { email } });
    await tx.userRole.createMany({ data: [{ profileId: profile.id, role: "FACULTY", grantedById: viewer.profileId }], skipDuplicates: true });
    const existing = await tx.courseFaculty.findUnique({ where: { offeringId_profileId: { offeringId: offering.id, profileId: profile.id } } });
    if (existing) throw new AppError("CONFLICT", "That person already teaches this course.");
    await tx.courseFaculty.create({ data: { offeringId: offering.id, profileId: profile.id, role: "INSTRUCTOR", addedById: viewer.profileId } });
    await recordAudit(tx, {
      actorId: viewer.profileId,
      action: "offering.faculty_added",
      entityType: "offering",
      entityId: offering.id,
      offeringId: offering.id,
      metadata: { profileId: profile.id },
    });
  });
}

export async function removeCoInstructor(viewer: Viewer, offeringId: unknown, profileId: unknown) {
  const { offering, facts } = await getManagedOffering(viewer, offeringId);
  if (!canAdministerOffering(viewer, facts)) throw forbidden("Only the course owner can remove co-instructors.");
  if (!isUuid(profileId)) throw notFound("Instructor");
  const target = offering.faculty.find((f) => f.profileId === profileId);
  if (!target) throw notFound("Instructor");
  if (target.role === "OWNER") throw new AppError("VALIDATION", "The course owner can't be removed.");
  await db.$transaction(async (tx) => {
    await tx.courseFaculty.delete({ where: { offeringId_profileId: { offeringId: offering.id, profileId } } });
    await recordAudit(tx, {
      actorId: viewer.profileId,
      action: "offering.faculty_removed",
      entityType: "offering",
      entityId: offering.id,
      offeringId: offering.id,
      metadata: { profileId },
    });
  });
}

export type OfferingHealth = "ok" | "needs_setup" | "attention" | "stale";

export function offeringHealth(o: {
  status: string;
  lastSyncStatus: string | null;
  lastSyncSuccessAt: Date | null;
  sheetSource: { status: string } | null;
  assessmentCount: number;
}, now = new Date()): OfferingHealth {
  if (o.status === "ARCHIVED") return "ok";
  if (!o.sheetSource || o.assessmentCount === 0) return "needs_setup";
  if (o.sheetSource.status === "ERROR" || ["FAILED", "VALIDATION_FAILED", "PARTIAL"].includes(o.lastSyncStatus ?? "")) return "attention";
  if (!o.lastSyncSuccessAt) return "needs_setup";
  const staleMs = getSyncSettings().staleAfterMinutes * 60_000;
  return now.getTime() - o.lastSyncSuccessAt.getTime() > staleMs ? "stale" : "ok";
}

/** Faculty course list with the facts the dashboard cards need (single query, no N+1). */
export async function listFacultyOfferings(viewer: Viewer) {
  if (!hasRole(viewer, "FACULTY")) return [];
  const rows = await db.courseOffering.findMany({
    where: { faculty: { some: { profileId: viewer.profileId } } },
    include: {
      course: true,
      semester: true,
      sheetSource: { select: { status: true, spreadsheetTitle: true } },
      faculty: { where: { profileId: viewer.profileId }, select: { role: true } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } }, assessments: { where: { archivedAt: null } } } },
    },
  });
  return rows
    .map((o) => ({
      id: o.id,
      code: o.course.code,
      title: o.title,
      section: o.section,
      season: o.semester.season,
      year: o.semester.year,
      status: o.status,
      publicationStatus: o.publicationStatus,
      lastSyncStatus: o.lastSyncStatus,
      lastSyncSuccessAt: o.lastSyncSuccessAt,
      lastSyncAttemptAt: o.lastSyncAttemptAt,
      sourceStatus: o.sheetSource?.status ?? null,
      spreadsheetTitle: o.sheetSource?.spreadsheetTitle ?? null,
      studentCount: o._count.enrollments,
      assessmentCount: o._count.assessments,
      myRole: o.faculty[0]?.role ?? "INSTRUCTOR",
      health: offeringHealth({ ...o, assessmentCount: o._count.assessments }),
    }))
    .sort(
      (a, b) =>
        Number(a.status === "ARCHIVED") - Number(b.status === "ARCHIVED") ||
        semesterSortKey(b.season, b.year) - semesterSortKey(a.season, a.year) ||
        a.code.localeCompare(b.code) ||
        a.section.localeCompare(b.section),
    );
}

export type FacultyOfferingSummary = Awaited<ReturnType<typeof listFacultyOfferings>>[number];

export async function facultyOverview(viewer: Viewer) {
  const offerings = await listFacultyOfferings(viewer);
  const ids = offerings.map((o) => o.id);
  const recent = ids.length
    ? await db.auditLog.findMany({
        where: { offeringId: { in: ids } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { actor: { select: { name: true, email: true } }, offering: { select: { title: true, section: true, course: { select: { code: true } } } } },
      })
    : [];
  const active = offerings.filter((o) => o.status === "ACTIVE");
  return {
    offerings,
    stats: {
      total: offerings.length,
      active: active.length,
      archived: offerings.length - active.length,
      published: active.filter((o) => o.publicationStatus === "PUBLISHED").length,
      unpublished: active.filter((o) => o.publicationStatus !== "PUBLISHED").length,
      students: active.reduce((sum, o) => sum + o.studentCount, 0),
    },
    attention: active.filter((o) => o.health !== "ok"),
    recent,
  };
}

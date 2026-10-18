import "server-only";
import { isUuid } from "@/lib/ids";
import { semesterLabel, semesterSortKey } from "@/lib/academic";
import { groupResultItems, type CourseResultsView, type ResultStatus } from "@/lib/results";
import { canViewOwnResults, hasRole, type Viewer } from "../authz/permissions";
import { db } from "../db";
import { notFound } from "../errors";

/**
 * Student read path. Every query is scoped by the viewer's own profile id and ACTIVE
 * enrollment; results come only from the offering's ACTIVE publication snapshot and only the
 * rows for the viewer's enrollment are ever selected.
 */
export async function listStudentCourses(viewer: Viewer) {
  if (!hasRole(viewer, "STUDENT")) return [];
  const enrollments = await db.enrollment.findMany({
    where: { studentProfileId: viewer.profileId, status: "ACTIVE" },
    select: {
      id: true,
      offering: {
        select: {
          id: true,
          title: true,
          section: true,
          status: true,
          course: { select: { code: true } },
          semester: { select: { season: true, year: true } },
          faculty: { select: { profile: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } },
          snapshots: {
            where: { status: "ACTIVE" },
            select: { version: true, createdAt: true, _count: { select: { assessments: true } } },
            take: 1,
          },
        },
      },
    },
  });
  return enrollments
    .map(({ offering: o }) => ({
      offeringId: o.id,
      code: o.course.code,
      title: o.title,
      section: o.section,
      semester: semesterLabel(o.semester.season, o.semester.year),
      semesterKey: semesterSortKey(o.semester.season, o.semester.year),
      archived: o.status === "ARCHIVED",
      instructors: o.faculty.map((f) => f.profile.name ?? f.profile.email),
      publishedAt: o.snapshots[0]?.createdAt.toISOString() ?? null,
      publishedCount: o.snapshots[0]?._count.assessments ?? 0,
    }))
    .sort((a, b) => b.semesterKey - a.semesterKey || a.code.localeCompare(b.code));
}

export type StudentCourseSummary = Awaited<ReturnType<typeof listStudentCourses>>[number];

export async function getStudentCourseResults(viewer: Viewer, offeringId: unknown): Promise<CourseResultsView> {
  if (!isUuid(offeringId)) throw notFound("Course");
  const enrollment = await db.enrollment.findUnique({
    where: { offeringId_studentProfileId: { offeringId, studentProfileId: viewer.profileId } },
    select: { id: true, studentProfileId: true, status: true },
  });
  // Same response whether the course doesn't exist or the student isn't enrolled.
  if (!canViewOwnResults(viewer, enrollment)) throw notFound("Course");
  return buildResultsView(offeringId, { kind: "published", enrollmentId: enrollment!.id });
}

/**
 * Builds the student-facing DTO. `published` reads the ACTIVE snapshot; `draft` (faculty preview
 * only; callers must authorize) reads the working copy for the given assessments.
 */
export async function buildResultsView(
  offeringId: string,
  source: { kind: "published"; enrollmentId: string } | { kind: "draft"; enrollmentId: string; assessmentIds: string[] },
): Promise<CourseResultsView> {
  const offering = await db.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      title: true,
      section: true,
      description: true,
      status: true,
      lastSyncStatus: true,
      lastSyncAttemptAt: true,
      course: { select: { code: true } },
      semester: { select: { season: true, year: true } },
      faculty: { select: { profile: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!offering) throw notFound("Course");
  const base = {
    offeringId: offering.id,
    code: offering.course.code,
    title: offering.title,
    section: offering.section,
    semester: semesterLabel(offering.semester.season, offering.semester.year),
    instructors: offering.faculty.map((f) => f.profile.name ?? f.profile.email),
    description: offering.description,
    archived: offering.status === "ARCHIVED",
  };

  if (source.kind === "published") {
    const snapshot = await db.publicationSnapshot.findFirst({
      where: { offeringId, status: "ACTIVE" },
      select: {
        id: true,
        version: true,
        createdAt: true,
        assessments: true,
        marks: { where: { enrollmentId: source.enrollmentId }, select: { assessmentId: true, status: true, score: true, textValue: true } },
      },
    });
    if (!snapshot) return { ...base, publication: null, groups: [], official: [], updatesDelayed: false };
    const marks = new Map(snapshot.marks.map((m) => [m.assessmentId, m]));
    const { groups, official } = groupResultItems(
      snapshot.assessments.map((a) => {
        const m = marks.get(a.assessmentId);
        return {
          assessmentId: a.assessmentId,
          name: a.name,
          kind: a.kind,
          valueType: a.valueType,
          maxScore: a.maxScore?.toString() ?? null,
          threshold: a.threshold?.toString() ?? null,
          status: (m?.status ?? "MISSING") as ResultStatus,
          score: m?.score?.toString() ?? null,
          textValue: m?.textValue ?? null,
          groupName: a.groupName,
          groupOrder: a.groupOrder,
          displayOrder: a.displayOrder,
        };
      }),
    );
    const updatesDelayed =
      offering.status === "ACTIVE" &&
      (offering.lastSyncStatus === "FAILED" || offering.lastSyncStatus === "VALIDATION_FAILED") &&
      !!offering.lastSyncAttemptAt &&
      offering.lastSyncAttemptAt > snapshot.createdAt;
    return { ...base, publication: { version: snapshot.version, publishedAt: snapshot.createdAt.toISOString() }, groups, official, updatesDelayed };
  }

  const assessments = await db.assessment.findMany({
    where: { offeringId, id: { in: source.assessmentIds }, archivedAt: null },
    include: { group: true, marks: { where: { enrollmentId: source.enrollmentId }, select: { status: true, score: true, textValue: true } } },
  });
  const { groups, official } = groupResultItems(
    assessments.map((a) => {
      const m = a.marks[0];
      return {
        assessmentId: a.id,
        name: a.name,
        kind: a.kind,
        valueType: a.valueType,
        maxScore: a.maxScore?.toString() ?? null,
        threshold: a.threshold?.toString() ?? null,
        status: (m?.status ?? "MISSING") as ResultStatus,
        score: m?.score?.toString() ?? null,
        textValue: m?.textValue ?? null,
        groupName: a.group.name,
        groupOrder: a.group.displayOrder,
        displayOrder: a.displayOrder,
      };
    }),
  );
  return { ...base, publication: { version: 0, publishedAt: new Date().toISOString() }, groups, official, updatesDelayed: false };
}

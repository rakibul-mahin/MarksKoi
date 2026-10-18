import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { isUuid } from "@/lib/ids";
import { normalizeEmail } from "@/lib/normalize";
import { canAdminister, canChangeRole, type RoleName, type Viewer } from "../authz/permissions";
import { db } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { clampPage, parseInput } from "../validation";
import { recordAudit } from "./audit";

/**
 * Administrator tools. Deliberately does not expose student marks: administrators manage
 * access and operations, not academic results.
 */
function assertAdmin(viewer: Viewer) {
  if (!canAdminister(viewer)) throw forbidden("Administrator access is required.");
}

const PAGE = 20;

export async function searchUsers(viewer: Viewer, q: string, page = 1) {
  assertAdmin(viewer);
  const term = q.trim().slice(0, 100);
  const where: Prisma.ProfileWhereInput = term
    ? {
        OR: [
          { email: { contains: term.toLowerCase() } },
          { name: { contains: term, mode: "insensitive" } },
          { studentId: { contains: term.toUpperCase() } },
        ],
      }
    : {};
  const [users, total] = await Promise.all([
    db.profile.findMany({
      where,
      orderBy: [{ lastSignInAt: { sort: "desc", nulls: "last" } }, { email: "asc" }],
      skip: (clampPage(page) - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        email: true,
        name: true,
        studentId: true,
        status: true,
        claimedAt: true,
        lastSignInAt: true,
        roles: { where: { revokedAt: null }, select: { role: true } },
      },
    }),
    db.profile.count({ where }),
  ]);
  return { users, total, page: clampPage(page), pageSize: PAGE };
}

export async function getUserDetail(viewer: Viewer, profileId: unknown) {
  assertAdmin(viewer);
  if (!isUuid(profileId)) throw notFound("User");
  const user = await db.profile.findUnique({
    where: { id: profileId },
    include: {
      roles: { include: { grantedBy: { select: { email: true } }, revokedBy: { select: { email: true } } }, orderBy: { grantedAt: "asc" } },
      accounts: { select: { provider: true, createdAt: true } },
      _count: { select: { sessions: true } },
      enrollments: {
        select: { status: true, offering: { select: { id: true, title: true, section: true, course: { select: { code: true } }, semester: true } } },
      },
      facultyAssignments: {
        select: { role: true, offering: { select: { id: true, title: true, section: true, course: { select: { code: true } }, semester: true } } },
      },
    },
  });
  if (!user) throw notFound("User");
  await recordAudit(db, { actorId: viewer.profileId, action: "admin.viewed_user", entityType: "profile", entityId: user.id });
  return user;
}

const roleSchema = z.object({ profileId: z.string().uuid(), role: z.enum(["STUDENT", "FACULTY", "ADMIN"]), grant: z.boolean(), reason: z.string().trim().max(300).optional() });

export async function setRole(viewer: Viewer, raw: unknown) {
  assertAdmin(viewer);
  const input = parseInput(roleSchema, raw);
  if (!canChangeRole(viewer, { profileId: input.profileId }, input.role as RoleName, input.grant)) {
    throw new AppError("FORBIDDEN", "You can't remove your own administrator role.");
  }
  const target = await db.profile.findUnique({ where: { id: input.profileId }, select: { id: true } });
  if (!target) throw notFound("User");
  await db.$transaction(async (tx) => {
    await tx.userRole.upsert({
      where: { profileId_role: { profileId: input.profileId, role: input.role } },
      update: input.grant
        ? { revokedAt: null, revokedById: null, grantedById: viewer.profileId, grantedAt: new Date(), reason: input.reason ?? null }
        : { revokedAt: new Date(), revokedById: viewer.profileId, reason: input.reason ?? null },
      create: input.grant
        ? { profileId: input.profileId, role: input.role, grantedById: viewer.profileId, reason: input.reason ?? null }
        : { profileId: input.profileId, role: input.role, revokedAt: new Date(), revokedById: viewer.profileId, reason: input.reason ?? null },
    });
    await recordAudit(tx, {
      actorId: viewer.profileId,
      action: input.grant ? "role.granted" : "role.revoked",
      entityType: "profile",
      entityId: input.profileId,
      metadata: { role: input.role, reason: input.reason ?? null },
    });
  });
}

export async function setSuspended(viewer: Viewer, profileId: unknown, suspended: boolean) {
  assertAdmin(viewer);
  if (!isUuid(profileId)) throw notFound("User");
  if (profileId === viewer.profileId) throw new AppError("FORBIDDEN", "You can't suspend your own account.");
  await db.$transaction(async (tx) => {
    await tx.profile.update({ where: { id: profileId }, data: { status: suspended ? "SUSPENDED" : "ACTIVE" } });
    if (suspended) await tx.session.deleteMany({ where: { profileId } });
    await recordAudit(tx, { actorId: viewer.profileId, action: suspended ? "profile.suspended" : "profile.reactivated", entityType: "profile", entityId: profileId });
  });
}

export async function revokeSessions(viewer: Viewer, profileId: unknown, opts: { unlinkGoogle?: boolean } = {}) {
  assertAdmin(viewer);
  if (!isUuid(profileId)) throw notFound("User");
  await db.$transaction(async (tx) => {
    const { count } = await tx.session.deleteMany({ where: { profileId } });
    if (opts.unlinkGoogle) await tx.account.deleteMany({ where: { profileId } });
    await recordAudit(tx, {
      actorId: viewer.profileId,
      action: "sessions.revoked",
      entityType: "profile",
      entityId: profileId,
      metadata: { sessions: count, unlinkedGoogle: !!opts.unlinkGoogle },
    });
  });
}

export async function listAllOfferings(viewer: Viewer, q: string, page = 1) {
  assertAdmin(viewer);
  const term = q.trim().slice(0, 100);
  const where: Prisma.CourseOfferingWhereInput = term
    ? { OR: [{ title: { contains: term, mode: "insensitive" } }, { course: { code: { contains: term.toUpperCase().replace(/\s+/g, "") } } }] }
    : {};
  const [offerings, total] = await Promise.all([
    db.courseOffering.findMany({
      where,
      orderBy: [{ semester: { year: "desc" } }, { course: { code: "asc" } }, { section: "asc" }],
      skip: (clampPage(page) - 1) * PAGE,
      take: PAGE,
      include: {
        course: true,
        semester: true,
        faculty: { include: { profile: { select: { id: true, name: true, email: true } } } },
        sheetSource: { select: { status: true } },
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
    }),
    db.courseOffering.count({ where }),
  ]);
  return { offerings, total, page: clampPage(page), pageSize: PAGE };
}

export async function adminAssignFaculty(viewer: Viewer, offeringId: unknown, rawEmail: unknown, role: "OWNER" | "INSTRUCTOR") {
  assertAdmin(viewer);
  if (!isUuid(offeringId)) throw notFound("Course");
  const email = normalizeEmail(rawEmail);
  if (!email) throw new AppError("VALIDATION", "Enter a valid email address.");
  const profile = await db.profile.findUnique({ where: { email }, include: { roles: { where: { revokedAt: null } } } });
  if (!profile || !profile.roles.some((r) => r.role === "FACULTY")) {
    throw new AppError("VALIDATION", "That person doesn't have the faculty role yet. Grant it first.");
  }
  await db.$transaction(async (tx) => {
    await tx.courseFaculty.upsert({
      where: { offeringId_profileId: { offeringId, profileId: profile.id } },
      update: { role },
      create: { offeringId, profileId: profile.id, role, addedById: viewer.profileId },
    });
    await recordAudit(tx, { actorId: viewer.profileId, action: "offering.faculty_added", entityType: "offering", entityId: offeringId, offeringId, metadata: { profileId: profile.id, role, byAdmin: true } });
  });
}

export async function adminRemoveFaculty(viewer: Viewer, offeringId: unknown, profileId: unknown) {
  assertAdmin(viewer);
  if (!isUuid(offeringId) || !isUuid(profileId)) throw notFound("Assignment");
  await db.$transaction(async (tx) => {
    const owners = await tx.courseFaculty.count({ where: { offeringId, role: "OWNER", profileId: { not: profileId } } });
    const target = await tx.courseFaculty.findUnique({ where: { offeringId_profileId: { offeringId, profileId } } });
    if (!target) throw notFound("Assignment");
    if (target.role === "OWNER" && owners === 0) throw new AppError("VALIDATION", "Assign another owner before removing the last one.");
    await tx.courseFaculty.delete({ where: { offeringId_profileId: { offeringId, profileId } } });
    await recordAudit(tx, { actorId: viewer.profileId, action: "offering.faculty_removed", entityType: "offering", entityId: offeringId, offeringId, metadata: { profileId, byAdmin: true } });
  });
}

export async function syncHealth(viewer: Viewer) {
  assertAdmin(viewer);
  const [byStatus, failing, stuck, recentFailures] = await Promise.all([
    db.courseOffering.groupBy({ by: ["lastSyncStatus"], where: { status: "ACTIVE" }, _count: true }),
    db.courseOffering.findMany({
      where: { status: "ACTIVE", lastSyncStatus: { in: ["FAILED", "VALIDATION_FAILED", "PARTIAL"] } },
      include: { course: true, semester: true },
      orderBy: { lastSyncAttemptAt: "desc" },
      take: 20,
    }),
    db.syncRun.findMany({
      where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
      include: { offering: { include: { course: true } } },
      take: 20,
    }),
    db.syncRun.findMany({
      where: { status: { in: ["FAILED", "VALIDATION_FAILED"] }, startedAt: { gt: new Date(Date.now() - 7 * 24 * 3600_000) } },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { offering: { include: { course: true } } },
    }),
  ]);
  return { byStatus, failing, stuck, recentFailures };
}

export async function listAllSyncRuns(viewer: Viewer, filter: { status?: string; page?: number }) {
  assertAdmin(viewer);
  const statuses = ["RUNNING", "SUCCEEDED", "PARTIAL", "VALIDATION_FAILED", "FAILED"] as const;
  const status = statuses.find((s) => s === filter.status);
  const where: Prisma.SyncRunWhereInput = status ? { status } : {};
  const page = clampPage(filter.page);
  const [runs, total] = await Promise.all([
    db.syncRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { offering: { include: { course: true, semester: true } }, triggeredBy: { select: { email: true } } },
    }),
    db.syncRun.count({ where }),
  ]);
  return { runs, total, page, pageSize: PAGE };
}

/** Recovery: clear a stuck lease and close abandoned RUNNING runs for an offering. */
export async function recoverSync(viewer: Viewer, offeringId: unknown) {
  assertAdmin(viewer);
  if (!isUuid(offeringId)) throw notFound("Course");
  await db.$transaction(async (tx) => {
    await tx.courseOffering.update({ where: { id: offeringId }, data: { syncLeaseToken: null, syncLeaseUntil: null } });
    const { count } = await tx.syncRun.updateMany({
      where: { offeringId, status: "RUNNING" },
      data: { status: "FAILED", errorCode: "INTERRUPTED", finishedAt: new Date(), summary: "Closed by an administrator during recovery. No data was changed." },
    });
    await recordAudit(tx, { actorId: viewer.profileId, action: "admin.sync_recovered", entityType: "offering", entityId: offeringId, offeringId, metadata: { closedRuns: count } });
  });
}

export async function searchAuditLogs(viewer: Viewer, filter: { action?: string; actor?: string; offeringId?: string; page?: number }) {
  assertAdmin(viewer);
  const page = clampPage(filter.page);
  const where: Prisma.AuditLogWhereInput = {
    ...(filter.action ? { action: { startsWith: filter.action.slice(0, 60) } } : {}),
    ...(filter.actor ? { actor: { email: { contains: filter.actor.toLowerCase().slice(0, 100) } } } : {}),
    ...(filter.offeringId && isUuid(filter.offeringId) ? { offeringId: filter.offeringId } : {}),
  };
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { actor: { select: { email: true, name: true } }, offering: { select: { title: true, section: true, course: { select: { code: true } } } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return { logs, total, page, pageSize: PAGE };
}

export async function adminOverview(viewer: Viewer) {
  assertAdmin(viewer);
  const [users, students, faculty, admins, offerings, activeOfferings, failing, runs24h] = await Promise.all([
    db.profile.count(),
    db.userRole.count({ where: { role: "STUDENT", revokedAt: null } }),
    db.userRole.count({ where: { role: "FACULTY", revokedAt: null } }),
    db.userRole.count({ where: { role: "ADMIN", revokedAt: null } }),
    db.courseOffering.count(),
    db.courseOffering.count({ where: { status: "ACTIVE" } }),
    db.courseOffering.count({ where: { status: "ACTIVE", lastSyncStatus: { in: ["FAILED", "VALIDATION_FAILED"] } } }),
    db.syncRun.count({ where: { startedAt: { gt: new Date(Date.now() - 24 * 3600_000) } } }),
  ]);
  return { users, students, faculty, admins, offerings, activeOfferings, failing, runs24h };
}

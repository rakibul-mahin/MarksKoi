import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { syncScoreAdapter } from "@/server/auth/adapter";
import { loadSignInFacts, provisionAfterSignIn } from "@/server/auth/provisioning";
import { decideSignIn } from "@/server/auth/sign-in-policy";
import { loadViewer } from "@/server/auth/viewer";
import { getUserDetail, recoverSync, revokeSessions, searchUsers, setRole, setSuspended } from "@/server/services/admin";
import { createOffering } from "@/server/services/offerings";
import { createUser, resetDatabase } from "../support/factories";

beforeEach(async () => {
  await resetDatabase();
});

const google = (email: string, sub = `sub-${email}`) => ({ provider: "google", providerAccountId: sub, claims: { email, email_verified: true } });

describe("sign-in and provisioning", () => {
  it("creates a profile, links Google and grants the domain's baseline role", async () => {
    const adapter = syncScoreAdapter(db);
    const facts = await loadSignInFacts(db, { ...google("New.Student@g.bracu.ac.bd"), sessionToken: null });
    expect(decideSignIn(facts)).toMatchObject({ ok: true, baselineRole: "STUDENT", profileId: null });
    const user = await adapter.createUser!({ id: "", email: "New.Student@g.bracu.ac.bd", emailVerified: null, name: "New Student" });
    await adapter.linkAccount!({ userId: user.id, type: "oidc", provider: "google", providerAccountId: "sub-1" });
    await provisionAfterSignIn(db, user.id, { email: "new.student@g.bracu.ac.bd", name: "New Student" });
    const viewer = await loadViewer(db, user.id);
    expect(viewer?.email).toBe("new.student@g.bracu.ac.bd");
    expect([...viewer!.roles]).toEqual(["STUDENT"]);
    expect((await db.profile.findUniqueOrThrow({ where: { id: user.id } })).claimedAt).not.toBeNull();
  });

  it("claims a pre-provisioned roster profile instead of creating a duplicate", async () => {
    const pre = await db.profile.create({ data: { email: "ayesha@g.bracu.ac.bd", studentId: "22101001" } });
    const facts = await loadSignInFacts(db, { ...google("ayesha@g.bracu.ac.bd"), sessionToken: null });
    expect(decideSignIn(facts)).toMatchObject({ ok: true, profileId: pre.id });
    const adapter = syncScoreAdapter(db);
    expect((await adapter.getUserByEmail!("AYESHA@g.bracu.ac.bd"))?.id).toBe(pre.id);
  });

  it("never re-grants a role an administrator revoked", async () => {
    const p = await db.profile.create({ data: { email: "t@bracu.ac.bd", roles: { create: { role: "FACULTY", revokedAt: new Date() } } } });
    await provisionAfterSignIn(db, p.id, { email: "t@bracu.ac.bd" });
    expect((await loadViewer(db, p.id))!.roles.size).toBe(0);
  });

  it("follows a Google Workspace email change for the same Google account", async () => {
    const p = await db.profile.create({ data: { email: "old@g.bracu.ac.bd", accounts: { create: { provider: "google", providerAccountId: "sub-x", type: "oidc" } } } });
    const facts = await loadSignInFacts(db, { ...google("new@g.bracu.ac.bd", "sub-x"), sessionToken: null });
    expect(decideSignIn(facts)).toMatchObject({ ok: true, profileId: p.id });
    await provisionAfterSignIn(db, p.id, { email: "new@g.bracu.ac.bd" });
    expect((await db.profile.findUniqueOrThrow({ where: { id: p.id } })).email).toBe("new@g.bracu.ac.bd");
  });

  it("refuses when the new email already belongs to another profile", async () => {
    await db.profile.create({ data: { email: "old@g.bracu.ac.bd", accounts: { create: { provider: "google", providerAccountId: "sub-x", type: "oidc" } } } });
    await db.profile.create({ data: { email: "taken@g.bracu.ac.bd" } });
    const facts = await loadSignInFacts(db, { ...google("taken@g.bracu.ac.bd", "sub-x"), sessionToken: null });
    expect(decideSignIn(facts)).toEqual({ ok: false, reason: "EMAIL_CONFLICT" });
  });

  it("refuses to link a second Google account to a profile (shared-computer protection)", async () => {
    const a = await db.profile.create({ data: { email: "a@g.bracu.ac.bd", accounts: { create: { provider: "google", providerAccountId: "sub-a", type: "oidc" } } } });
    const session = await db.session.create({ data: { profileId: a.id, sessionToken: "tok-a", expires: new Date(Date.now() + 3600_000) } });
    // Policy: a different person signing in while A's session cookie is present is refused.
    const facts = await loadSignInFacts(db, { ...google("b@g.bracu.ac.bd", "sub-b"), sessionToken: session.sessionToken });
    expect(decideSignIn(facts)).toEqual({ ok: false, reason: "SIGNED_IN_AS_OTHER" });
    // Database: even if the policy were bypassed, the link itself is rejected.
    await expect(syncScoreAdapter(db).linkAccount!({ userId: a.id, type: "oidc", provider: "google", providerAccountId: "sub-b" })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it("denies suspended users and recreated Google accounts", async () => {
    await db.profile.create({ data: { email: "s@g.bracu.ac.bd", status: "SUSPENDED" } });
    expect(decideSignIn(await loadSignInFacts(db, { ...google("s@g.bracu.ac.bd"), sessionToken: null }))).toEqual({ ok: false, reason: "SUSPENDED" });
    await db.profile.create({ data: { email: "r@g.bracu.ac.bd", accounts: { create: { provider: "google", providerAccountId: "old-sub", type: "oidc" } } } });
    expect(decideSignIn(await loadSignInFacts(db, { ...google("r@g.bracu.ac.bd", "new-sub"), sessionToken: null }))).toEqual({ ok: false, reason: "GOOGLE_ACCOUNT_CHANGED" });
  });

  it("expires and deletes stale sessions", async () => {
    const p = await db.profile.create({ data: { email: "e@g.bracu.ac.bd" } });
    await db.session.create({ data: { profileId: p.id, sessionToken: "old", expires: new Date(Date.now() - 1000) } });
    expect(await syncScoreAdapter(db).getSessionAndUser!("old")).toBeNull();
    expect(await db.session.count()).toBe(0);
  });
});

describe("administrator tools", () => {
  it("requires the admin role", async () => {
    const faculty = await createUser(["FACULTY"]);
    await expect(searchUsers(faculty, "")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setRole(faculty, { profileId: faculty.profileId, role: "ADMIN", grant: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("grants and revokes roles with an audit trail, but not the admin's own admin role", async () => {
    const admin = await createUser(["ADMIN"]);
    const target = await createUser(["STUDENT"]);
    await setRole(admin, { profileId: target.profileId, role: "FACULTY", grant: true, reason: "TA" });
    expect([...(await loadViewer(db, target.profileId))!.roles].sort()).toEqual(["FACULTY", "STUDENT"]);
    await setRole(admin, { profileId: target.profileId, role: "FACULTY", grant: false });
    expect([...(await loadViewer(db, target.profileId))!.roles]).toEqual(["STUDENT"]);
    await expect(setRole(admin, { profileId: admin.profileId, role: "ADMIN", grant: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.auditLog.count({ where: { action: { in: ["role.granted", "role.revoked"] } } })).toBe(2);
  });

  it("suspends users and revokes their sessions; logs admin views", async () => {
    const admin = await createUser(["ADMIN"]);
    const target = await createUser(["STUDENT"]);
    await db.session.create({ data: { profileId: target.profileId, sessionToken: "t1", expires: new Date(Date.now() + 3600_000) } });
    await setSuspended(admin, target.profileId, true);
    expect(await db.session.count({ where: { profileId: target.profileId } })).toBe(0);
    await expect(setSuspended(admin, admin.profileId, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await getUserDetail(admin, target.profileId);
    await revokeSessions(admin, target.profileId, { unlinkGoogle: true });
    expect(await db.auditLog.count({ where: { action: "admin.viewed_user", actorId: admin.profileId } })).toBe(1);
  });

  it("recovers a stuck sync", async () => {
    const admin = await createUser(["ADMIN"]);
    const faculty = await createUser(["FACULTY"]);
    const o = await createOffering(faculty, { courseCode: "CSE110", courseTitle: "PL I", season: "FALL", year: 2026, section: "1" });
    await db.courseOffering.update({ where: { id: o.id }, data: { syncLeaseToken: "x", syncLeaseUntil: new Date(Date.now() + 3600_000) } });
    await db.syncRun.create({ data: { offeringId: o.id, trigger: "MANUAL", status: "RUNNING" } });
    await recoverSync(admin, o.id);
    expect(await db.courseOffering.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ syncLeaseToken: null });
    expect(await db.syncRun.count({ where: { status: "RUNNING" } })).toBe(0);
  });
});

describe("schema constraints", () => {
  it("enables row-level security on every application table", async () => {
    const rows = await db.$queryRaw<Array<{ tablename: string; rowsecurity: boolean }>>`
      SELECT tablename::text AS tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    expect(rows.length).toBeGreaterThanOrEqual(21);
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([]);
  });

  it("enforces lower-case emails, unique student ids and unique enrollments", async () => {
    await expect(db.profile.create({ data: { email: "Upper@g.bracu.ac.bd" } })).rejects.toThrow();
    await db.profile.create({ data: { email: "a@g.bracu.ac.bd", studentId: "1" } });
    await expect(db.profile.create({ data: { email: "b@g.bracu.ac.bd", studentId: "1" } })).rejects.toThrow();
  });

  it("rejects marks whose value doesn't match their status, and negative scores", async () => {
    const faculty = await createUser(["FACULTY"]);
    const o = await createOffering(faculty, { courseCode: "CSE110", courseTitle: "PL I", season: "FALL", year: 2026, section: "1" });
    const s = await createUser(["STUDENT"]);
    const e = await db.enrollment.create({ data: { offeringId: o.id, studentProfileId: s.profileId } });
    await expect(db.enrollment.create({ data: { offeringId: o.id, studentProfileId: s.profileId } })).rejects.toThrow();
    const g = await db.assessmentGroup.create({ data: { offeringId: o.id, name: "Q" } });
    const a = await db.assessment.create({ data: { offeringId: o.id, groupId: g.id, name: "Q1", maxScore: "10" } });
    await expect(db.mark.create({ data: { offeringId: o.id, enrollmentId: e.id, assessmentId: a.id, status: "SCORED" } })).rejects.toThrow();
    await expect(db.mark.create({ data: { offeringId: o.id, enrollmentId: e.id, assessmentId: a.id, status: "MISSING", score: "0" } })).rejects.toThrow();
    await expect(db.mark.create({ data: { offeringId: o.id, enrollmentId: e.id, assessmentId: a.id, status: "SCORED", score: "-1" } })).rejects.toThrow();
    await db.mark.create({ data: { offeringId: o.id, enrollmentId: e.id, assessmentId: a.id, status: "SCORED", score: "0" } });
    await expect(db.assessment.create({ data: { offeringId: o.id, groupId: g.id, name: "NoMax", valueType: "NUMERIC" } })).rejects.toThrow();
  });

  it("allows only one active snapshot per offering and protects referenced profiles", async () => {
    const faculty = await createUser(["FACULTY"]);
    const o = await createOffering(faculty, { courseCode: "CSE110", courseTitle: "PL I", season: "FALL", year: 2026, section: "1" });
    await db.publicationSnapshot.create({ data: { offeringId: o.id, version: 1, status: "ACTIVE" } });
    await expect(db.publicationSnapshot.create({ data: { offeringId: o.id, version: 2, status: "ACTIVE" } })).rejects.toThrow();
    const s = await createUser(["STUDENT"]);
    await db.enrollment.create({ data: { offeringId: o.id, studentProfileId: s.profileId } });
    await expect(db.profile.delete({ where: { id: s.profileId } })).rejects.toThrow();
  });

  it("rejects duplicate sections for the same course and semester", async () => {
    const faculty = await createUser(["FACULTY"]);
    await createOffering(faculty, { courseCode: "cse 110", courseTitle: "PL I", season: "FALL", year: 2026, section: "1" });
    await expect(createOffering(faculty, { courseCode: "CSE110", courseTitle: "PL I", season: "FALL", year: 2026, section: "01" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

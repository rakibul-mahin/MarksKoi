import { describe, expect, it } from "vitest";
import {
  canAdminister,
  canAdministerOffering,
  canChangeRole,
  canEditOffering,
  canManageOffering,
  canPublishOffering,
  canViewOwnResults,
  homePathFor,
  type RoleName,
  type Viewer,
} from "@/server/authz/permissions";

const viewer = (roles: RoleName[], opts: Partial<Viewer> = {}): Viewer => ({
  profileId: "p1",
  roles: new Set(roles),
  suspended: false,
  ...opts,
});

describe("offering permissions", () => {
  const assigned = { facultyRole: "INSTRUCTOR" as const, archived: false };
  const notAssigned = { facultyRole: null, archived: false };

  it("requires explicit assignment for faculty", () => {
    expect(canManageOffering(viewer(["FACULTY"]), assigned)).toBe(true);
    expect(canManageOffering(viewer(["FACULTY"]), notAssigned)).toBe(false);
  });

  it("denies students and admins without assignment", () => {
    expect(canManageOffering(viewer(["STUDENT"]), assigned)).toBe(false);
    expect(canPublishOffering(viewer(["ADMIN"]), notAssigned)).toBe(false);
  });

  it("blocks edits on archived offerings and for suspended users", () => {
    expect(canEditOffering(viewer(["FACULTY"]), { ...assigned, archived: true })).toBe(false);
    expect(canManageOffering(viewer(["FACULTY"]), { ...assigned, archived: true })).toBe(true);
    expect(canEditOffering(viewer(["FACULTY"], { suspended: true }), assigned)).toBe(false);
  });

  it("reserves co-instructor management for owners", () => {
    expect(canAdministerOffering(viewer(["FACULTY"]), assigned)).toBe(false);
    expect(canAdministerOffering(viewer(["FACULTY"]), { facultyRole: "OWNER", archived: false })).toBe(true);
  });
});

describe("student result access", () => {
  it("allows only the enrolled student with an active enrollment", () => {
    const v = viewer(["STUDENT"]);
    expect(canViewOwnResults(v, { studentProfileId: "p1", status: "ACTIVE" })).toBe(true);
    expect(canViewOwnResults(v, { studentProfileId: "p2", status: "ACTIVE" })).toBe(false);
    expect(canViewOwnResults(v, { studentProfileId: "p1", status: "REMOVED" })).toBe(false);
    expect(canViewOwnResults(v, null)).toBe(false);
    expect(canViewOwnResults(viewer(["FACULTY"]), { studentProfileId: "p1", status: "ACTIVE" })).toBe(false);
  });
});

describe("admin permissions", () => {
  it("prevents an admin removing their own admin role", () => {
    const admin = viewer(["ADMIN"]);
    expect(canAdminister(admin)).toBe(true);
    expect(canChangeRole(admin, { profileId: "p1" }, "ADMIN", false)).toBe(false);
    expect(canChangeRole(admin, { profileId: "p2" }, "ADMIN", false)).toBe(true);
    expect(canChangeRole(viewer(["FACULTY"]), { profileId: "p2" }, "FACULTY", true)).toBe(false);
  });

  it("routes users to a sensible home", () => {
    expect(homePathFor(viewer(["STUDENT"]))).toBe("/student");
    expect(homePathFor(viewer(["FACULTY", "ADMIN"]))).toBe("/faculty");
    expect(homePathFor(viewer(["ADMIN"]))).toBe("/admin");
    expect(homePathFor(viewer([]))).toContain("/unauthorized");
  });
});

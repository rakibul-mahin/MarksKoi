/**
 * Pure authorization predicates. Every check takes the already-loaded facts as arguments so the
 * rules are unit-testable and the same rules are used by pages, server actions and route handlers.
 */
export type RoleName = "STUDENT" | "FACULTY" | "ADMIN";

export type Viewer = {
  profileId: string;
  roles: ReadonlySet<RoleName>;
  suspended: boolean;
};

export type OfferingFacts = {
  /** Faculty assignment of the viewer on this offering, if any. */
  facultyRole: "OWNER" | "INSTRUCTOR" | null;
  archived: boolean;
};

export function hasRole(viewer: Viewer, role: RoleName): boolean {
  return !viewer.suspended && viewer.roles.has(role);
}

/** Faculty may manage an offering only when explicitly assigned to it. */
export function canManageOffering(viewer: Viewer, facts: OfferingFacts): boolean {
  return hasRole(viewer, "FACULTY") && facts.facultyRole !== null;
}

/** Editing configuration / syncing is blocked for archived offerings. */
export function canEditOffering(viewer: Viewer, facts: OfferingFacts): boolean {
  return canManageOffering(viewer, facts) && !facts.archived;
}

export function canPublishOffering(viewer: Viewer, facts: OfferingFacts): boolean {
  return canEditOffering(viewer, facts);
}

/** Only owners can add/remove co-instructors or archive. */
export function canAdministerOffering(viewer: Viewer, facts: OfferingFacts): boolean {
  return canManageOffering(viewer, facts) && facts.facultyRole === "OWNER";
}

/**
 * A student may view an offering's published results only through their own ACTIVE enrollment.
 * Faculty/admin roles do not grant access to the student view of someone else's marks.
 */
export function canViewOwnResults(viewer: Viewer, enrollment: { studentProfileId: string | null; status: "ACTIVE" | "REMOVED" } | null): boolean {
  // Pending-access enrollments (no linked account) never match anyone.
  return (
    hasRole(viewer, "STUDENT") &&
    enrollment !== null &&
    enrollment.status === "ACTIVE" &&
    enrollment.studentProfileId !== null &&
    enrollment.studentProfileId === viewer.profileId
  );
}

export function canAdminister(viewer: Viewer): boolean {
  return hasRole(viewer, "ADMIN");
}

/** Admins cannot remove their own admin role (prevents locking the platform out). */
export function canChangeRole(actor: Viewer, target: { profileId: string }, role: RoleName, grant: boolean): boolean {
  if (!canAdminister(actor)) return false;
  if (!grant && role === "ADMIN" && target.profileId === actor.profileId) return false;
  return true;
}

/** Landing page for a viewer with several roles. */
export function homePathFor(viewer: Viewer): string {
  if (hasRole(viewer, "FACULTY")) return "/faculty";
  if (hasRole(viewer, "STUDENT")) return "/student";
  if (hasRole(viewer, "ADMIN")) return "/admin";
  return "/unauthorized?reason=NO_ROLE";
}

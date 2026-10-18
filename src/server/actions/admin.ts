"use server";

import { requireActionViewer } from "../auth/guards";
import { runAction } from "./run-action";
import { A, arg } from "./args";
import { adminAssignFaculty, adminRemoveFaculty, recoverSync, revokeSessions, setRole, setSuspended } from "../services/admin";

// Each action re-checks the ADMIN role here and again in the service layer.

export async function setRoleAction(profileId: string, role: "STUDENT" | "FACULTY" | "ADMIN", grant: boolean) {
  return runAction("setRole", async () => {
    const viewer = await requireActionViewer("ADMIN");
    await setRole(viewer, { profileId: arg(A.id, profileId), role: arg(A.role, role), grant: arg(A.bool, grant) });
  }, grant ? "Role granted" : "Role revoked");
}

export async function setSuspendedAction(profileId: string, suspended: boolean) {
  return runAction("setSuspended", async () => {
    const viewer = await requireActionViewer("ADMIN");
    await setSuspended(viewer, arg(A.id, profileId), arg(A.bool, suspended));
  }, suspended ? "Account suspended and signed out" : "Account reactivated");
}

export async function revokeSessionsAction(profileId: string, unlinkGoogle: boolean) {
  return runAction("revokeSessions", async () => {
    const viewer = await requireActionViewer("ADMIN");
    await revokeSessions(viewer, arg(A.id, profileId), { unlinkGoogle: arg(A.bool, unlinkGoogle) });
  }, unlinkGoogle ? "Signed out and Google link reset" : "Signed out of all devices");
}

export async function assignFacultyAction(offeringId: string, email: string, role: "OWNER" | "INSTRUCTOR") {
  return runAction("assignFaculty", async () => {
    const viewer = await requireActionViewer("ADMIN");
    await adminAssignFaculty(viewer, arg(A.id, offeringId), arg(A.email, email), arg(A.facultyRole, role));
  }, "Instructor assigned");
}

export async function removeFacultyAction(offeringId: string, profileId: string) {
  return runAction("removeFaculty", async () => {
    const viewer = await requireActionViewer("ADMIN");
    await adminRemoveFaculty(viewer, arg(A.id, offeringId), arg(A.id, profileId));
  }, "Instructor removed");
}

export async function recoverSyncAction(offeringId: string) {
  return runAction("recoverSync", async () => {
    const viewer = await requireActionViewer("ADMIN");
    await recoverSync(viewer, arg(A.id, offeringId));
  }, "Sync lock cleared");
}

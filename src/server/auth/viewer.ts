import "server-only";
import type { Db } from "../db";
import type { RoleName, Viewer } from "../authz/permissions";

export type CurrentViewer = Viewer & {
  email: string;
  name: string | null;
  image: string | null;
  studentId: string | null;
};

/** Loads a viewer's identity and active (non-revoked) roles. */
export async function loadViewer(db: Db, profileId: string): Promise<CurrentViewer | null> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      studentId: true,
      status: true,
      roles: { where: { revokedAt: null }, select: { role: true } },
    },
  });
  if (!profile) return null;
  return {
    profileId: profile.id,
    email: profile.email,
    name: profile.name,
    image: profile.image,
    studentId: profile.studentId,
    suspended: profile.status === "SUSPENDED",
    roles: new Set(profile.roles.map((r) => r.role as RoleName)),
  };
}

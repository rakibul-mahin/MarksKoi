import type { Issue, RosterStudent } from "./build";

/**
 * Matches roster students to platform profiles. The verified university email is the primary
 * key; the student ID is a cross-check. We never attach marks to a profile on the strength of a
 * student ID alone, because a typo in the ID column would then leak one student's marks to
 * another. Conflicts abort the sync (structural) so an administrator can resolve them.
 */
export type ExistingProfile = { id: string; email: string; studentId: string | null };

export type IdentityResolution =
  | {
      ok: true;
      profileByStudentKey: Map<string, string>;
      creates: Array<{ id: string; email: string; studentId: string | null; name: string | null }>;
      studentIdUpdates: Array<{ profileId: string; studentId: string }>;
      issues: Issue[];
    }
  | { ok: false; issues: Issue[] };

export function resolveIdentities(roster: Array<RosterStudent & { email: string }>, profiles: ExistingProfile[], newId: () => string, rosterTitle: string): IdentityResolution {
  const byEmail = new Map(profiles.map((p) => [p.email, p]));
  const byStudentId = new Map(profiles.filter((p) => p.studentId).map((p) => [p.studentId as string, p]));
  const issues: Issue[] = [];
  const profileByStudentKey = new Map<string, string>();
  const creates: Array<{ id: string; email: string; studentId: string | null; name: string | null }> = [];
  const studentIdUpdates: Array<{ profileId: string; studentId: string }> = [];
  let conflict = false;

  for (const s of roster) {
    const ctx = { worksheetTitle: rosterTitle, rowNumber: s.row };
    const emailMatch = byEmail.get(s.email);
    const idMatch = s.studentId ? byStudentId.get(s.studentId) : undefined;

    if (emailMatch) {
      if (idMatch && idMatch.id !== emailMatch.id) {
        conflict = true;
        issues.push({
          severity: "ERROR",
          code: "IDENTITY_CONFLICT",
          structural: true,
          ...ctx,
          message: `Row ${s.row}: student ID ${s.studentId} already belongs to a different MarksKoi account than ${s.email}. An administrator must resolve this before marks can sync.`,
        });
        continue;
      }
      if (s.studentId && emailMatch.studentId && emailMatch.studentId !== s.studentId) {
        issues.push({
          severity: "WARNING",
          code: "STUDENT_ID_DIFFERS",
          ...ctx,
          message: `Row ${s.row}: the student ID in the sheet (${s.studentId}) differs from the one on the student's account. The student was matched by email; check the ID column.`,
        });
      } else if (s.studentId && !emailMatch.studentId) {
        studentIdUpdates.push({ profileId: emailMatch.id, studentId: s.studentId });
      }
      profileByStudentKey.set(s.key, emailMatch.id);
      continue;
    }

    if (idMatch) {
      conflict = true;
      issues.push({
        severity: "ERROR",
        code: "IDENTITY_CONFLICT",
        structural: true,
        ...ctx,
        message: `Row ${s.row}: student ID ${s.studentId} belongs to an account with a different email than ${s.email}. Correct the sheet, or ask an administrator to update the student's account.`,
      });
      continue;
    }

    const id = newId();
    creates.push({ id, email: s.email, studentId: s.studentId, name: s.name });
    profileByStudentKey.set(s.key, id);
  }

  if (conflict) return { ok: false, issues };
  return { ok: true, profileByStudentKey, creates, studentIdUpdates, issues };
}

import { markKey, type MarkStatusValue } from "./cell";
import { cellKey, type CellResult } from "./build";

/**
 * Idempotent diff between desired cells and the stored working copy. Unchanged marks are not
 * written, so re-running a sync with identical spreadsheet contents performs no mark writes.
 */
export type StoredMark = { enrollmentId: string; assessmentId: string; status: MarkStatusValue; score: string | null; textValue: string | null };

export type MarkWrite = {
  enrollmentId: string;
  assessmentId: string;
  status: MarkStatusValue;
  score: string | null;
  textValue: string | null;
  rawValue: string | null;
  isNew: boolean;
};

export type MarkPlan = { writes: MarkWrite[]; created: number; updated: number; unchanged: number; skippedInvalid: number };

export function planMarkWrites(
  cells: CellResult[],
  invalidCellKeys: Set<string>,
  enrollmentByStudentKey: Map<string, string>,
  existing: StoredMark[],
): MarkPlan {
  const current = new Map(existing.map((m) => [`${m.enrollmentId}|${m.assessmentId}`, m]));
  const writes: MarkWrite[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const cell of cells) {
    if (invalidCellKeys.has(cellKey(cell.studentKey, cell.assessmentId))) continue;
    const enrollmentId = enrollmentByStudentKey.get(cell.studentKey);
    if (!enrollmentId) continue;
    const prev = current.get(`${enrollmentId}|${cell.assessmentId}`);
    if (prev && markKey(prev) === markKey(cell)) {
      unchanged++;
      continue;
    }
    writes.push({
      enrollmentId,
      assessmentId: cell.assessmentId,
      status: cell.status,
      score: cell.score,
      textValue: cell.textValue,
      rawValue: cell.raw,
      isNew: !prev,
    });
    if (prev) updated++;
    else created++;
  }
  return { writes, created, updated, unchanged, skippedInvalid: invalidCellKeys.size };
}

/**
 * Guard against destructive mistakes (wrong worksheet chosen, sheet truncated by a filter):
 * refuse when a large share of currently enrolled students would disappear at once.
 */
export function massRemovalCheck(activeEnrollments: number, removals: number): { ok: true } | { ok: false; message: string } {
  if (activeEnrollments > 5 && removals > activeEnrollments / 2) {
    return {
      ok: false,
      message: `This sync would remove ${removals} of ${activeEnrollments} enrolled students. That looks like a mistake (for example, a filtered or truncated roster), so nothing was changed. Check the roster worksheet and try again.`,
    };
  }
  return { ok: true };
}

/**
 * Enrollment diff for one offering.
 * - Students with an official email are enrolled under their profile.
 * - Students without one get a "pending access" enrollment (no profile), keyed by student ID.
 * - When a pending student's email appears, the pending enrollment is linked to the profile
 *   (same offering, same student ID, same sheet row), so already-published marks become visible.
 * - A student already linked here keeps that link if the sheet's email is later blanked.
 */
export type ExistingEnrollment = {
  id: string;
  studentProfileId: string | null;
  status: "ACTIVE" | "REMOVED";
  sourceEmail: string | null;
  sourceStudentId: string | null;
  sourceName: string | null;
  sourceRow: number | null;
};
export type EnrollmentSource = { sourceEmail: string | null; sourceStudentId: string | null; sourceName: string | null; sourceRow: number };
export type EnrollmentPlan = {
  creates: Array<{ id: string; studentProfileId: string | null } & EnrollmentSource>;
  updates: Array<{ id: string; data: { status: "ACTIVE"; removedAt: null; studentProfileId?: string } & EnrollmentSource }>;
  removeIds: string[];
  enrollmentByStudentKey: Map<string, string>;
  reactivated: number;
  linked: number;
  pending: number;
  /** Roster rows without an email whose student is nevertheless already linked to an account here. */
  stillLinkedRows: number[];
};

export function planEnrollments(
  roster: Array<{ key: string; email: string | null; studentId: string | null; name: string | null; row: number }>,
  profileByStudentKey: Map<string, string>,
  existing: ExistingEnrollment[],
  newId: () => string,
): EnrollmentPlan {
  const byProfile = new Map(existing.filter((e) => e.studentProfileId).map((e) => [e.studentProfileId!, e]));
  const pendingById = new Map(existing.filter((e) => !e.studentProfileId && e.sourceStudentId).map((e) => [e.sourceStudentId!, e]));
  const linkedById = new Map(existing.filter((e) => e.studentProfileId && e.sourceStudentId).map((e) => [e.sourceStudentId!, e]));
  const used = new Set<string>();
  const plan: EnrollmentPlan = { creates: [], updates: [], removeIds: [], enrollmentByStudentKey: new Map(), reactivated: 0, linked: 0, pending: 0, stillLinkedRows: [] };

  const reuse = (s: (typeof roster)[number], e: ExistingEnrollment, source: EnrollmentSource, linkTo?: string) => {
    used.add(e.id);
    plan.enrollmentByStudentKey.set(s.key, e.id);
    if (e.status === "REMOVED") plan.reactivated++;
    const changed =
      linkTo !== undefined ||
      e.status !== "ACTIVE" ||
      e.sourceEmail !== source.sourceEmail ||
      e.sourceStudentId !== source.sourceStudentId ||
      e.sourceName !== source.sourceName ||
      e.sourceRow !== source.sourceRow;
    if (changed) plan.updates.push({ id: e.id, data: { status: "ACTIVE", removedAt: null, ...source, ...(linkTo ? { studentProfileId: linkTo } : {}) } });
  };

  for (const s of roster) {
    const source: EnrollmentSource = { sourceEmail: s.email, sourceStudentId: s.studentId, sourceName: s.name, sourceRow: s.row };
    if (s.email) {
      const profileId = profileByStudentKey.get(s.key);
      if (!profileId) continue; // identity resolution failed for this row (reported elsewhere)
      const mine = byProfile.get(profileId);
      const waiting = s.studentId ? pendingById.get(s.studentId) : undefined;
      if (mine && !used.has(mine.id)) reuse(s, mine, source);
      else if (waiting && !used.has(waiting.id)) {
        reuse(s, waiting, source, profileId);
        plan.linked++;
      } else {
        const id = newId();
        plan.creates.push({ id, studentProfileId: profileId, ...source });
        plan.enrollmentByStudentKey.set(s.key, id);
      }
      continue;
    }
    // No official email: identified by student ID within this offering.
    const already = s.studentId ? linkedById.get(s.studentId) : undefined;
    if (already && !used.has(already.id)) {
      reuse(s, already, { ...source, sourceEmail: already.sourceEmail });
      plan.stillLinkedRows.push(s.row);
      continue;
    }
    plan.pending++;
    const waiting = s.studentId ? pendingById.get(s.studentId) : undefined;
    if (waiting && !used.has(waiting.id)) reuse(s, waiting, source);
    else {
      const id = newId();
      plan.creates.push({ id, studentProfileId: null, ...source });
      plan.enrollmentByStudentKey.set(s.key, id);
    }
  }
  plan.removeIds = existing.filter((e) => e.status === "ACTIVE" && !used.has(e.id)).map((e) => e.id);
  return plan;
}

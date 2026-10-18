import { db } from "@/server/db";
import { loadViewer, type CurrentViewer } from "@/server/auth/viewer";
import type { RoleName } from "@/server/authz/permissions";
import { FixtureSheetsClient, type FixtureFile } from "@/server/sheets/fixture-client";
import { setSheetsClientForTesting } from "@/server/sheets";
import type { Grid } from "@/server/sheets/types";

const TABLES = [
  "rate_limits",
  "audit_logs",
  "published_marks",
  "published_assessments",
  "publication_snapshots",
  "marks",
  "sync_errors",
  "sync_runs",
  "assessment_columns",
  "assessments",
  "assessment_groups",
  "sheet_worksheets",
  "sheet_sources",
  "enrollments",
  "course_faculty",
  "course_offerings",
  "courses",
  "semesters",
  "user_roles",
  "sessions",
  "accounts",
  "profiles",
];

export async function resetDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!url.pathname.endsWith("_test")) throw new Error("resetDatabase() only runs against *_test databases.");
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let counter = 0;
export async function createUser(roles: RoleName[], opts: { email?: string; name?: string; studentId?: string } = {}): Promise<CurrentViewer> {
  counter++;
  const domain = roles.includes("STUDENT") ? "g.bracu.ac.bd" : "bracu.ac.bd";
  const profile = await db.profile.create({
    data: {
      email: opts.email ?? `user${counter}-${Date.now()}@${domain}`,
      name: opts.name ?? `User ${counter}`,
      studentId: opts.studentId ?? null,
      claimedAt: new Date(),
      roles: { create: roles.map((role) => ({ role })) },
    },
  });
  return (await loadViewer(db, profile.id))!;
}

/** In-memory "Google Sheets" that tests can mutate between steps. */
export class MutableSheets {
  file: FixtureFile = {};
  client = new FixtureSheetsClient(() => structuredClone(this.file));
  install() {
    setSheetsClientForTesting(this.client);
    return this;
  }
  set(id: string, title: string, sheets: Array<{ sheetId: number; title: string; values: Grid }>) {
    this.file[id] = { title, sheets };
  }
  update(id: string, fn: (s: FixtureFile[string]) => void) {
    fn(this.file[id]);
  }
}

export const SPREADSHEET_ID = "1TestSpreadsheetIdForIntegrationTests_abcdef";
export const OTHER_SPREADSHEET_ID = "1OtherSpreadsheetIdForIntegrationTests_xyz12";

export const rosterGrid = (): Grid => [
  ["Student ID", "Name", "Email", "Attendance"],
  [22101001, "Ayesha Rahman", "ayesha@g.bracu.ac.bd", 5],
  [22101002, "Tanvir Hasan", "tanvir@g.bracu.ac.bd", 4],
  [22101003, "Nusrat Jahan", "nusrat@g.bracu.ac.bd", null],
];

export const quizGrid = (): Grid => [
  ["Student ID", "Quiz 1", "Quiz 2"],
  [22101001, 8, 0],
  [22101002, 7.5, "ex"],
  [22101003, "pending", 9],
];

export const midGrid = (): Grid => [
  ["Student ID", "Midterm"],
  [22101001, 25],
  [22101002, 28.5],
  [22101003, null],
];

export function standardSpreadsheet(sheets: MutableSheets, id = SPREADSHEET_ID) {
  sheets.set(id, "CSE110 Fall 2026 Marks", [
    { sheetId: 0, title: "Roster", values: rosterGrid() },
    { sheetId: 101, title: "Quizzes", values: quizGrid() },
    { sheetId: 202, title: "Midterm", values: midGrid() },
  ]);
}

export function standardMapping(existing?: Record<string, string>) {
  return {
    worksheets: [
      { googleSheetId: 0, enabled: true, isRoster: true, headerRow: 1, studentIdHeader: "Student ID", emailHeader: "Email", nameHeader: "Name" },
      { googleSheetId: 101, enabled: true, isRoster: false, headerRow: 1, studentIdHeader: "Student ID", emailHeader: null, nameHeader: null },
      { googleSheetId: 202, enabled: true, isRoster: false, headerRow: 1, studentIdHeader: "Student ID", emailHeader: null, nameHeader: null },
    ],
    assessments: [
      { id: existing?.["Attendance"] ?? null, key: "att", name: "Attendance", groupName: "Attendance", valueType: "NUMERIC" as const, kind: "REGULAR" as const, maxScore: "5", columns: [{ googleSheetId: 0, header: "Attendance" }] },
      { id: existing?.["Quiz 1"] ?? null, key: "q1", name: "Quiz 1", groupName: "Quizzes", valueType: "NUMERIC" as const, kind: "REGULAR" as const, maxScore: "10", columns: [{ googleSheetId: 101, header: "Quiz 1" }] },
      { id: existing?.["Quiz 2"] ?? null, key: "q2", name: "Quiz 2", groupName: "Quizzes", valueType: "NUMERIC" as const, kind: "REGULAR" as const, maxScore: "10", columns: [{ googleSheetId: 101, header: "Quiz 2" }] },
      { id: existing?.["Midterm"] ?? null, key: "mid", name: "Midterm", groupName: "Midterm", valueType: "NUMERIC" as const, kind: "REGULAR" as const, maxScore: "30", columns: [{ googleSheetId: 202, header: "Midterm" }] },
    ],
  };
}

export async function assessmentIds(offeringId: string): Promise<Record<string, string>> {
  const rows = await db.assessment.findMany({ where: { offeringId, archivedAt: null } });
  return Object.fromEntries(rows.map((a) => [a.name, a.id]));
}

export async function studentViewer(email: string): Promise<CurrentViewer> {
  const p = await db.profile.findUniqueOrThrow({ where: { email } });
  await db.userRole.createMany({ data: [{ profileId: p.id, role: "STUDENT" }], skipDuplicates: true });
  return (await loadViewer(db, p.id))!;
}

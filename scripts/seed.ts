/**
 * Development seed. Creates realistic courses by driving the real services
 * (create → connect spreadsheet → map columns → sync → publish) against the local
 * fixture spreadsheets in fixtures/sheets.dev.json.
 *
 * Creates data only — it does not create sessions, passwords or any sign-in shortcut.
 * Refuses to run when NODE_ENV=production or SHEETS_DRIVER isn't "fixture".
 *
 * Usage: pnpm db:seed
 */
import { db } from "@/server/db";
import { loadViewer } from "@/server/auth/viewer";
import { createOffering } from "@/server/services/offerings";
import { connectSpreadsheet, saveMapping, type MappingPayload } from "@/server/services/sources";
import { publishResults } from "@/server/services/publication";
import { triggerSync } from "@/server/services/sync";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production.");
if (process.env.SHEETS_DRIVER !== "fixture") throw new Error("Seed requires SHEETS_DRIVER=fixture (local fixture spreadsheets).");

const CSE = "1SyncScoreDevCSE110Fall2026MarksSheet_abcdefgh";
const MAT = "1SyncScoreDevMAT110Fall2026MarksSheet_ijklmnop";

async function person(email: string, name: string, roles: Array<"STUDENT" | "FACULTY" | "ADMIN">) {
  const p = await db.profile.upsert({ where: { email }, update: { name }, create: { email, name } });
  await db.userRole.createMany({ data: roles.map((role) => ({ profileId: p.id, role })), skipDuplicates: true });
  return (await loadViewer(db, p.id))!;
}

const num = (key: string, name: string, groupName: string, maxScore: string, columns: MappingPayload["assessments"][number]["columns"]) => ({
  key,
  id: null,
  name,
  groupName,
  valueType: "NUMERIC" as const,
  kind: "REGULAR" as const,
  maxScore,
  columns,
});

async function main() {
  const existing = await db.courseOffering.count();
  if (existing > 0) {
    console.log(`Database already has ${existing} course offerings; skipping seed (it only seeds an empty database).`);
    return;
  }
  await person("admin@bracu.ac.bd", "Platform Admin", ["ADMIN"]);
  const farhana = await person("farhana.islam@bracu.ac.bd", "Dr. Farhana Islam", ["FACULTY"]);
  const kamal = await person("kamal.uddin@bracu.ac.bd", "Kamal Uddin", ["FACULTY"]);

  // CSE110 — multi-worksheet course, lab marks split across two worksheets.
  const cse = await createOffering(farhana, { courseCode: "CSE110", courseTitle: "Programming Language I", season: "FALL", year: 2026, section: "01", description: "Consultation: Sunday & Tuesday, 2–4 pm, Room 7A-03." });
  await connectSpreadsheet(farhana, cse.id, CSE);
  const cseMapping: MappingPayload = {
    worksheets: [
      { googleSheetId: 0, enabled: true, isRoster: true, headerRow: 1, studentIdHeader: "Student ID", emailHeader: "Email", nameHeader: "Full Name" },
      { googleSheetId: 1101, enabled: true, isRoster: false, headerRow: 1, studentIdHeader: "Student ID", emailHeader: null, nameHeader: null },
      { googleSheetId: 1102, enabled: true, isRoster: false, headerRow: 1, studentIdHeader: "Student ID", emailHeader: null, nameHeader: null },
      { googleSheetId: 1103, enabled: true, isRoster: false, headerRow: 2, studentIdHeader: "Student ID", emailHeader: null, nameHeader: null },
      { googleSheetId: 1104, enabled: true, isRoster: false, headerRow: 1, studentIdHeader: "Student ID", emailHeader: null, nameHeader: null },
      { googleSheetId: 1105, enabled: true, isRoster: false, headerRow: 1, studentIdHeader: "Student ID", emailHeader: null, nameHeader: null },
    ],
    assessments: [
      num("att", "Attendance", "Attendance", "5", [{ googleSheetId: 0, header: "Attendance (5)" }]),
      num("q1", "Quiz 1", "Quizzes", "10", [{ googleSheetId: 1101, header: "Quiz 1 (10)" }]),
      num("q2", "Quiz 2", "Quizzes", "10", [{ googleSheetId: 1101, header: "Quiz 2 (10)" }]),
      num("q3", "Quiz 3", "Quizzes", "10", [{ googleSheetId: 1101, header: "Quiz 3 (10)" }]),
      num("a1", "Assignment 1", "Assignments", "20", [{ googleSheetId: 1102, header: "Assignment 1 (20)" }]),
      num("a2", "Assignment 2", "Assignments", "20", [{ googleSheetId: 1102, header: "Assignment 2 (20)" }]),
      num("lab1", "Lab 1", "Labs", "10", [
        { googleSheetId: 1104, header: "Lab 1 (10)" },
        { googleSheetId: 1105, header: "Lab 1 (10)" },
      ]),
      num("mid", "Midterm", "Midterm", "30", [{ googleSheetId: 1103, header: "Midterm (30)" }]),
    ],
    acknowledgeWarnings: true,
  };
  await saveMapping(farhana, cse.id, cseMapping);
  const cseSync = await triggerSync(farhana, cse.id, "CONFIG_CHANGE");
  console.log(`CSE110 sync: ${cseSync.status} — ${cseSync.summary}`);
  const cseAssessments = await db.assessment.findMany({ where: { offeringId: cse.id, name: { not: "Assignment 2" } } });
  await publishResults(farhana, cse.id, { assessmentIds: cseAssessments.map((a) => a.id), note: "Seed: first publication" });

  // MAT110 — single worksheet, email-only identities, faculty-provided grade column.
  const mat = await createOffering(kamal, { courseCode: "MAT110", courseTitle: "Differential Calculus & Coordinate Geometry", season: "FALL", year: 2026, section: "03" });
  await connectSpreadsheet(kamal, mat.id, MAT);
  await saveMapping(kamal, mat.id, {
    worksheets: [{ googleSheetId: 0, enabled: true, isRoster: true, headerRow: 1, studentIdHeader: null, emailHeader: "Email", nameHeader: "Name" }],
    assessments: [
      num("ct1", "Class Test 1", "Class tests", "15", [{ googleSheetId: 0, header: "Class Test 1 (15)" }]),
      num("ct2", "Class Test 2", "Class tests", "15", [{ googleSheetId: 0, header: "Class Test 2 (15)" }]),
      { key: "grade", id: null, name: "Final grade", groupName: "Official", valueType: "TEXT", kind: "OFFICIAL_GRADE", maxScore: null, columns: [{ googleSheetId: 0, header: "Final Grade" }] },
    ],
  });
  const matSync = await triggerSync(kamal, mat.id, "CONFIG_CHANGE");
  console.log(`MAT110 sync: ${matSync.status} — ${matSync.summary}`);
  const matAssessments = await db.assessment.findMany({ where: { offeringId: mat.id } });
  await publishResults(kamal, mat.id, { assessmentIds: matAssessments.map((a) => a.id) });

  console.log("Seed complete. Accounts are created without sign-in credentials; sign in with Google (or use the E2E session helper in tests).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

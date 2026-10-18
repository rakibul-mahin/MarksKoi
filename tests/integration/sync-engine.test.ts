import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createOffering } from "@/server/services/offerings";
import { connectSpreadsheet, previewMapping, saveMapping } from "@/server/services/sources";
import { autoSyncIfDue, isSyncDue, runScheduledSyncs, triggerSync } from "@/server/services/sync";
import { runSync } from "@/server/sync/engine";
import { acquireLease, releaseLease } from "@/server/sync/lease";
import { SheetsError } from "@/server/sheets/types";
import type { CurrentViewer } from "@/server/auth/viewer";
import {
  assessmentIds,
  createUser,
  MutableSheets,
  resetDatabase,
  rosterGrid,
  SPREADSHEET_ID,
  standardMapping,
  standardSpreadsheet,
} from "../support/factories";

let sheets: MutableSheets;
let faculty: CurrentViewer;
let offeringId: string;

async function setupCourse() {
  const offering = await createOffering(faculty, { courseCode: "CSE110", courseTitle: "Programming Language I", season: "FALL", year: 2026, section: "1" });
  offeringId = offering.id;
  await connectSpreadsheet(faculty, offeringId, `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=0`);
  const saved = await saveMapping(faculty, offeringId, { ...standardMapping(), acknowledgeWarnings: true });
  expect(saved.saved).toBe(true);
}

async function markOf(email: string, assessment: string) {
  return db.mark.findFirst({
    where: { offeringId, assessment: { name: assessment }, enrollment: { student: { email } } },
  });
}

beforeEach(async () => {
  await resetDatabase();
  sheets = new MutableSheets().install();
  standardSpreadsheet(sheets);
  faculty = await createUser(["FACULTY"]);
  await setupCourse();
});

describe("sync engine — happy path", () => {
  it("imports roster, enrollments and marks with distinct states", async () => {
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("SUCCEEDED");
    expect(await db.enrollment.count({ where: { offeringId, status: "ACTIVE" } })).toBe(3);
    expect(await db.mark.count({ where: { offeringId } })).toBe(12);
    expect((await markOf("ayesha@g.bracu.ac.bd", "Quiz 2"))).toMatchObject({ status: "SCORED" });
    expect((await markOf("ayesha@g.bracu.ac.bd", "Quiz 2"))?.score?.toString()).toBe("0");
    expect(await markOf("tanvir@g.bracu.ac.bd", "Quiz 2")).toMatchObject({ status: "EXCUSED", score: null });
    expect(await markOf("nusrat@g.bracu.ac.bd", "Quiz 1")).toMatchObject({ status: "PENDING" });
    expect(await markOf("nusrat@g.bracu.ac.bd", "Attendance")).toMatchObject({ status: "MISSING", score: null });
    const offering = await db.courseOffering.findUniqueOrThrow({ where: { id: offeringId } });
    expect(offering.lastSyncStatus).toBe("SUCCEEDED");
    expect(offering.lastSyncSuccessAt).not.toBeNull();
    expect(offering.syncLeaseToken).toBeNull();
  });

  it("creates unclaimed student profiles once and reuses them across courses taught by different faculty", async () => {
    await triggerSync(faculty, offeringId);
    const other = await createUser(["FACULTY"]);
    const second = await createOffering(other, { courseCode: "MAT110", courseTitle: "Calculus", season: "FALL", year: 2026, section: "3" });
    sheets.set("1SecondSpreadsheetForMathCourse_0123456789", "MAT110", [{ sheetId: 5, title: "Marks", values: [["Email", "Name", "Quiz"], ["AYESHA@g.bracu.ac.bd ", "Ayesha", 9]] }]);
    await connectSpreadsheet(other, second.id, "1SecondSpreadsheetForMathCourse_0123456789");
    await saveMapping(other, second.id, {
      worksheets: [{ googleSheetId: 5, enabled: true, isRoster: true, headerRow: 1, studentIdHeader: null, emailHeader: "Email", nameHeader: "Name" }],
      assessments: [{ key: "q", name: "Quiz", groupName: "Quizzes", valueType: "NUMERIC", kind: "REGULAR", maxScore: "10", columns: [{ googleSheetId: 5, header: "Quiz" }] }],
    });
    expect((await triggerSync(other, second.id)).status).toBe("SUCCEEDED");
    expect(await db.profile.count({ where: { email: "ayesha@g.bracu.ac.bd" } })).toBe(1);
    const ayesha = await db.profile.findUniqueOrThrow({ where: { email: "ayesha@g.bracu.ac.bd" }, include: { enrollments: true } });
    expect(ayesha.enrollments).toHaveLength(2);
    expect(ayesha.studentId).toBe("22101001");
  });

  it("is idempotent: a second identical sync changes nothing", async () => {
    await triggerSync(faculty, offeringId);
    const before = await db.mark.findMany({ where: { offeringId }, orderBy: { id: "asc" } });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("SUCCEEDED");
    const run = await db.syncRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(run).toMatchObject({ marksCreated: 0, marksUpdated: 0, marksUnchanged: 12, enrollmentsAdded: 0 });
    const after = await db.mark.findMany({ where: { offeringId }, orderBy: { id: "asc" } });
    expect(after.map((m) => [m.id, m.updatedAt.getTime()])).toEqual(before.map((m) => [m.id, m.updatedAt.getTime()]));
  });

  it("updates only changed marks", async () => {
    await triggerSync(faculty, offeringId);
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[1].values[1][1] = 9; // Ayesha Quiz 1: 8 → 9
    });
    const outcome = await triggerSync(faculty, offeringId);
    const run = await db.syncRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(run).toMatchObject({ marksUpdated: 1, marksCreated: 0, marksUnchanged: 11 });
    expect((await markOf("ayesha@g.bracu.ac.bd", "Quiz 1"))?.score?.toString()).toBe("9");
  });

  it("previews without writing anything", async () => {
    const preview = await previewMapping(faculty, offeringId, standardMapping(await assessmentIds(offeringId)));
    expect(preview.ok).toBe(true);
    expect(preview.preview?.studentCount).toBe(3);
    expect(await db.mark.count()).toBe(0);
    expect(await db.enrollment.count()).toBe(0);
    expect(await db.syncRun.count()).toBe(0);
  });
});

describe("sync engine — failures preserve previous valid data", () => {
  beforeEach(async () => {
    expect((await triggerSync(faculty, offeringId)).status).toBe("SUCCEEDED");
  });

  it("keeps the previous value for an invalid cell and reports PARTIAL with row/column context", async () => {
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[1].values[1][1] = "abc";
      s.sheets[1].values[2][1] = 6;
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("PARTIAL");
    expect((await markOf("ayesha@g.bracu.ac.bd", "Quiz 1"))?.score?.toString()).toBe("8");
    expect((await markOf("tanvir@g.bracu.ac.bd", "Quiz 1"))?.score?.toString()).toBe("6");
    const issue = await db.syncIssue.findFirstOrThrow({ where: { syncRunId: outcome.runId, code: "UNSUPPORTED_VALUE" } });
    expect(issue).toMatchObject({ worksheetTitle: "Quizzes", rowNumber: 2, columnHeader: "Quiz 1", severity: "ERROR" });
  });

  it("rejects a deleted worksheet without touching marks", async () => {
    const before = await db.mark.findMany({ orderBy: { id: "asc" } });
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets = s.sheets.filter((w) => w.sheetId !== 101);
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("VALIDATION_FAILED");
    expect(await db.syncIssue.count({ where: { syncRunId: outcome.runId, code: "WORKSHEET_MISSING" } })).toBe(1);
    expect(await db.mark.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    const offering = await db.courseOffering.findUniqueOrThrow({ where: { id: offeringId } });
    expect(offering.lastSyncStatus).toBe("VALIDATION_FAILED");
  });

  it("requires review when a mapped column header is renamed", async () => {
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[1].values[0][1] = "Quiz One";
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("VALIDATION_FAILED");
    expect(await db.syncIssue.findFirst({ where: { syncRunId: outcome.runId, code: "COLUMN_NOT_FOUND" } })).toMatchObject({ columnHeader: "Quiz 1" });
  });

  it("follows inserted columns and renamed worksheets, and flags new unmapped columns", async () => {
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[1].title = "Quiz Marks";
      s.sheets[1].values = s.sheets[1].values.map((r, i) => [r[0], i === 0 ? "Comment" : "", ...r.slice(1), i === 0 ? "Quiz 3" : 4]);
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("SUCCEEDED");
    const codes = (await db.syncIssue.findMany({ where: { syncRunId: outcome.runId } })).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["WORKSHEET_RENAMED", "COLUMN_MOVED", "NEW_COLUMN"]));
    expect(await db.assessment.count({ where: { offeringId, name: "Quiz 3" } })).toBe(0);
    const ws = await db.sheetWorksheet.findFirstOrThrow({ where: { googleSheetId: 101 } });
    expect(ws.title).toBe("Quiz Marks");
  });

  it("records Google timeouts as FAILED and keeps data", async () => {
    const before = await db.mark.count();
    sheets.update(SPREADSHEET_ID, (s) => {
      s.failure = "TIMEOUT";
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("FAILED");
    expect(outcome.summary).toContain("previously synced marks were kept");
    const run = await db.syncRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(run.errorCode).toBe("TIMEOUT");
    expect(await db.mark.count()).toBe(before);
  });

  it("marks the source as broken when sharing is revoked", async () => {
    sheets.update(SPREADSHEET_ID, (s) => {
      s.shared = false;
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("FAILED");
    expect((await db.sheetSource.findFirstOrThrow()).status).toBe("ERROR");
    sheets.update(SPREADSHEET_ID, (s) => {
      s.shared = true;
    });
    expect((await triggerSync(faculty, offeringId)).status).toBe("SUCCEEDED");
    expect((await db.sheetSource.findFirstOrThrow()).status).toBe("CONNECTED");
  });

  it("marks students removed from the roster as REMOVED but keeps their history", async () => {
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[0].values = s.sheets[0].values.filter((r) => r[2] !== "nusrat@g.bracu.ac.bd");
      s.sheets[1].values = s.sheets[1].values.filter((r) => r[0] !== 22101003);
      s.sheets[2].values = s.sheets[2].values.filter((r) => r[0] !== 22101003);
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("SUCCEEDED");
    const e = await db.enrollment.findFirstOrThrow({ where: { student: { email: "nusrat@g.bracu.ac.bd" } } });
    expect(e.status).toBe("REMOVED");
    expect(await db.mark.count({ where: { enrollmentId: e.id } })).toBe(4);
  });

  it("blocks a sync that would remove most of the class", async () => {
    // Grow the class to 8 students, then truncate the roster to 2.
    sheets.update(SPREADSHEET_ID, (s) => {
      for (let i = 4; i <= 8; i++) s.sheets[0].values.push([22101000 + i, `Student ${i}`, `s${i}@g.bracu.ac.bd`, 3]);
    });
    expect((await triggerSync(faculty, offeringId)).status).toBe("SUCCEEDED");
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[0].values = s.sheets[0].values.slice(0, 3);
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("VALIDATION_FAILED");
    expect(await db.enrollment.count({ where: { offeringId, status: "ACTIVE" } })).toBe(8);
  });

  it("rolls back every write when the database transaction fails", async () => {
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[0].values.push([22101099, "New Student", "newbie@g.bracu.ac.bd", 2]);
    });
    // Sabotage: a Sheets client that deletes an assessment after reading data, so the mark
    // upsert inside the transaction violates a foreign key.
    const real = sheets.client;
    const ids = await assessmentIds(offeringId);
    const sabotaging = {
      getSpreadsheet: (id: string) => real.getSpreadsheet(id),
      getWorksheetValues: async (id: string, titles: string[]) => {
        const values = await real.getWorksheetValues(id, titles);
        await db.$executeRaw`ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_test_sabotage`;
        await db.$executeRaw`ALTER TABLE marks ADD CONSTRAINT marks_test_sabotage CHECK (assessment_id <> ${ids["Quiz 1"]}::uuid) NOT VALID`;
        return values;
      },
    };
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[1].values[1][1] = 1; // forces a write to Quiz 1
    });
    try {
      const outcome = await runSync({ db, sheets: sabotaging }, offeringId, { trigger: "MANUAL", actorId: faculty.profileId });
      expect(outcome.status).toBe("FAILED");
    } finally {
      await db.$executeRaw`ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_test_sabotage`;
    }
    expect(await db.profile.count({ where: { email: "newbie@g.bracu.ac.bd" } })).toBe(0);
    expect((await markOf("ayesha@g.bracu.ac.bd", "Quiz 1"))?.score?.toString()).toBe("8");
    const offering = await db.courseOffering.findUniqueOrThrow({ where: { id: offeringId } });
    expect(offering.syncLeaseToken).toBeNull();
  });
});

describe("sync engine — concurrency", () => {
  it("allows only one sync at a time per course", async () => {
    const results = await Promise.allSettled([triggerSync(faculty, offeringId), triggerSync(faculty, offeringId), triggerSync(faculty, offeringId)]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const blocked = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of blocked) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "SYNC_IN_PROGRESS" });
    expect(await db.mark.count({ where: { offeringId } })).toBe(12);
    expect(await db.syncRun.count({ where: { status: "RUNNING" } })).toBe(0);
  });

  it("refuses to start while a lease is held, and recovers after the lease expires", async () => {
    const token = await acquireLease(db, offeringId, 60);
    expect(token).not.toBeNull();
    await expect(triggerSync(faculty, offeringId)).rejects.toMatchObject({ code: "SYNC_IN_PROGRESS" });
    await releaseLease(db, offeringId, token!);
    // Simulate a crashed process: expired lease + abandoned RUNNING run.
    await db.courseOffering.update({ where: { id: offeringId }, data: { syncLeaseToken: "dead", syncLeaseUntil: new Date(Date.now() - 1000) } });
    await db.syncRun.create({ data: { offeringId, trigger: "SCHEDULED", status: "RUNNING" } });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("SUCCEEDED");
    expect(await db.syncRun.count({ where: { offeringId, errorCode: "INTERRUPTED" } })).toBe(1);
  });

  it("aborts the commit if the lease was lost mid-sync (fencing)", async () => {
    const real = sheets.client;
    const stealing = {
      getSpreadsheet: (id: string) => real.getSpreadsheet(id),
      getWorksheetValues: async (id: string, titles: string[]) => {
        const values = await real.getWorksheetValues(id, titles);
        await db.courseOffering.update({ where: { id: offeringId }, data: { syncLeaseToken: "someone-else" } });
        return values;
      },
    };
    const outcome = await runSync({ db, sheets: stealing }, offeringId, { trigger: "MANUAL", actorId: null });
    expect(outcome.status).toBe("FAILED");
    expect(await db.mark.count()).toBe(0);
  });

  it("classifies configuration errors from the Sheets client", async () => {
    const broken = {
      getSpreadsheet: async () => {
        throw new SheetsError("AUTH_FAILED", "bad key");
      },
      getWorksheetValues: async () => [],
    };
    const outcome = await runSync({ db, sheets: broken }, offeringId, { trigger: "SCHEDULED", actorId: null });
    expect(outcome).toMatchObject({ status: "FAILED" });
    expect((await db.syncRun.findUniqueOrThrow({ where: { id: outcome.runId } })).errorCode).toBe("AUTH_FAILED");
  });
});

describe("identity conflicts", () => {
  it("aborts when a student ID in the sheet belongs to another account", async () => {
    await db.profile.create({ data: { email: "someone.else@g.bracu.ac.bd", studentId: "22101002" } });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("VALIDATION_FAILED");
    expect(await db.syncIssue.count({ where: { syncRunId: outcome.runId, code: "IDENTITY_CONFLICT" } })).toBe(1);
    expect(await db.enrollment.count()).toBe(0);
  });

  it("syncs a roster row with a non-student email as pending access, without creating an account", async () => {
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[0].values = [...rosterGrid(), [22101077, "Late Email", "late.student@gmail.com", 1]];
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("SUCCEEDED");
    expect(outcome.summary).toContain("1 without portal access");
    expect(await db.profile.count({ where: { email: "late.student@gmail.com" } })).toBe(0);
    const pending = await db.enrollment.findFirstOrThrow({ where: { offeringId, sourceStudentId: "22101077" } });
    expect(pending).toMatchObject({ studentProfileId: null, status: "ACTIVE" });
    expect(await db.syncIssue.count({ where: { syncRunId: outcome.runId, code: "NO_PORTAL_EMAIL", severity: "WARNING" } })).toBe(1);
  });
});

describe("automatic syncing (15-minute interval)", () => {
  it("decides when a sync is due", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(isSyncDue(null, now, 15)).toBe(true);
    expect(isSyncDue(new Date("2026-10-12T09:50:00Z"), now, 15)).toBe(false);
    expect(isSyncDue(new Date("2026-10-12T09:45:00Z"), now, 15)).toBe(true);
  });

  it("syncs on a faculty page visit only when the last attempt is older than the interval", async () => {
    const first = await autoSyncIfDue(faculty, offeringId);
    expect(first).toMatchObject({ ran: true, status: "SUCCEEDED" });
    expect((await db.syncRun.findFirstOrThrow({ where: { offeringId } })).trigger).toBe("AUTO");

    expect(await autoSyncIfDue(faculty, offeringId)).toEqual({ ran: false, reason: "recent" });

    await db.courseOffering.update({ where: { id: offeringId }, data: { lastSyncAttemptAt: new Date(Date.now() - 16 * 60_000) } });
    expect(await autoSyncIfDue(faculty, offeringId)).toMatchObject({ ran: true });
  });

  it("never auto-syncs a course the viewer doesn't teach", async () => {
    const other = await createUser(["FACULTY"]);
    await expect(autoSyncIfDue(other, offeringId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.syncRun.count({ where: { offeringId } })).toBe(0);
  });

  it("the scheduler picks courses whose last attempt is older than ~15 minutes", async () => {
    expect((await runScheduledSyncs()).results).toEqual([{ offeringId, status: "SUCCEEDED" }]);
    expect((await runScheduledSyncs()).processed).toBe(0); // just synced
    await db.courseOffering.update({ where: { id: offeringId }, data: { lastSyncAttemptAt: new Date(Date.now() - 15 * 60_000) } });
    expect((await runScheduledSyncs()).processed).toBe(1);
    expect(await db.syncRun.count({ where: { offeringId, trigger: "SCHEDULED" } })).toBe(2);
  });
});

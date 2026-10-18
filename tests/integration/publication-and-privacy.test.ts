import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createOffering, setArchived, addCoInstructor, updateOffering, deleteOffering } from "@/server/services/offerings";
import { acquireLease, releaseLease } from "@/server/sync/lease";
import { connectSpreadsheet, saveMapping, verifyConnection } from "@/server/services/sources";
import { triggerSync, listSyncRuns } from "@/server/services/sync";
import { getPublicationOverview, previewAsStudent, publishResults, unpublishResults } from "@/server/services/publication";
import { getStudentCourseResults, listStudentCourses } from "@/server/services/student";
import type { CurrentViewer } from "@/server/auth/viewer";
import { loadViewer } from "@/server/auth/viewer";
import {
  assessmentIds,
  createUser,
  MutableSheets,
  resetDatabase,
  SPREADSHEET_ID,
  standardMapping,
  standardSpreadsheet,
  studentViewer,
} from "../support/factories";

let sheets: MutableSheets;
let faculty: CurrentViewer;
let offeringId: string;
let ids: Record<string, string>;

beforeEach(async () => {
  await resetDatabase();
  sheets = new MutableSheets().install();
  standardSpreadsheet(sheets);
  faculty = await createUser(["FACULTY"]);
  const o = await createOffering(faculty, { courseCode: "CSE110", courseTitle: "Programming Language I", season: "FALL", year: 2026, section: "01" });
  offeringId = o.id;
  await connectSpreadsheet(faculty, offeringId, SPREADSHEET_ID);
  await saveMapping(faculty, offeringId, standardMapping());
  await triggerSync(faculty, offeringId);
  ids = await assessmentIds(offeringId);
});

describe("publication workflow", () => {
  it("students see nothing until results are published", async () => {
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    const view = await getStudentCourseResults(ayesha, offeringId);
    expect(view.publication).toBeNull();
    expect(view.groups).toEqual([]);
    const courses = await listStudentCourses(ayesha);
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ code: "CSE110", publishedAt: null });
  });

  it("publishes only selected assessments and only the student's own marks", async () => {
    const result = await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"], ids["Quiz 2"], ids["Attendance"]] });
    expect(result.version).toBe(1);
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    const view = await getStudentCourseResults(ayesha, offeringId);
    const items = view.groups.flatMap((g) => g.items);
    expect(items.map((i) => i.name).sort()).toEqual(["Attendance", "Quiz 1", "Quiz 2"]);
    expect(items.find((i) => i.name === "Midterm")).toBeUndefined();
    expect(items.find((i) => i.name === "Quiz 2")).toMatchObject({ status: "SCORED", score: "0" });
    expect(items.find((i) => i.name === "Quiz 1")).toMatchObject({ status: "SCORED", score: "8" });
    // Exactly one mark row per published assessment for this student — no other students' data.
    expect(items).toHaveLength(3);

    const nusrat = await studentViewer("nusrat@g.bracu.ac.bd");
    const nView = await getStudentCourseResults(nusrat, offeringId);
    const nItems = nView.groups.flatMap((g) => g.items);
    expect(nItems.find((i) => i.name === "Attendance")).toMatchObject({ status: "MISSING", score: null });
    expect(nItems.find((i) => i.name === "Quiz 1")).toMatchObject({ status: "PENDING", score: null });
  });

  it("a later sync never changes what students see until faculty republish", async () => {
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[1].values[1][1] = 2;
    });
    await triggerSync(faculty, offeringId);
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    expect((await getStudentCourseResults(ayesha, offeringId)).groups[0].items[0].score).toBe("8");
    const overview = await getPublicationOverview(faculty, offeringId);
    expect(overview.pendingChanges).toBe(1);

    const draft = await previewAsStudent(faculty, offeringId, {
      enrollmentId: (await db.enrollment.findFirstOrThrow({ where: { studentProfileId: ayesha.profileId } })).id,
      mode: "draft",
      assessmentIds: [ids["Quiz 1"]],
    });
    expect(draft.groups[0].items[0].score).toBe("2");

    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    expect((await getStudentCourseResults(ayesha, offeringId)).groups[0].items[0].score).toBe("2");
    expect((await getPublicationOverview(faculty, offeringId)).pendingChanges).toBe(0);
    expect(await db.publicationSnapshot.count({ where: { offeringId, status: "ACTIVE" } })).toBe(1);
    expect(await db.publicationSnapshot.count({ where: { offeringId, status: "SUPERSEDED" } })).toBe(1);
  });

  it("unpublishing hides results again and is audited", async () => {
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    await unpublishResults(faculty, offeringId);
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    expect((await getStudentCourseResults(ayesha, offeringId)).publication).toBeNull();
    const actions = (await db.auditLog.findMany({ where: { offeringId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["publication.published", "publication.unpublished", "mapping.saved", "offering.created"]));
  });

  it("auto-publish republishes the published set after a clean sync", async () => {
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    await updateOffering(faculty, offeringId, { title: "Programming Language I", section: "01", description: "", autoPublish: true, scheduledSync: true });
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[1].values[1][1] = 10;
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.autoPublished).toBe(true);
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    const items = (await getStudentCourseResults(ayesha, offeringId)).groups.flatMap((g) => g.items);
    expect(items.map((i) => i.name)).toEqual(["Quiz 1"]);
    expect(items[0].score).toBe("10");
  });

  it("does not auto-publish a sync with errors", async () => {
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    await updateOffering(faculty, offeringId, { title: "Programming Language I", section: "01", description: "", autoPublish: true, scheduledSync: true });
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[1].values[2][1] = 3;
      s.sheets[1].values[1][2] = "oops";
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("PARTIAL");
    expect(outcome.autoPublished).toBe(false);
  });

  it("keeps the course URL (UUID) stable across mapping and spreadsheet changes", async () => {
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    sheets.set("1ReplacementSheetForSameCourse_000000000000", "New marks file", [
      { sheetId: 9, title: "All", values: [["Student ID", "Email", "Quiz 1"], [22101001, "ayesha@g.bracu.ac.bd", 6]] },
    ]);
    await connectSpreadsheet(faculty, offeringId, "1ReplacementSheetForSameCourse_000000000000");
    await saveMapping(faculty, offeringId, {
      worksheets: [{ googleSheetId: 9, enabled: true, isRoster: true, headerRow: 1, studentIdHeader: "Student ID", emailHeader: "Email", nameHeader: null }],
      assessments: [{ id: ids["Quiz 1"], key: "q1", name: "Quiz 1", groupName: "Quizzes", valueType: "NUMERIC", kind: "REGULAR", maxScore: "10", columns: [{ googleSheetId: 9, header: "Quiz 1" }] }],
    });
    // 2 of 3 students would be removed → blocked by the mass-removal guard... unless class is small.
    const outcome = await triggerSync(faculty, offeringId);
    expect(["SUCCEEDED", "VALIDATION_FAILED"]).toContain(outcome.status);
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    const view = await getStudentCourseResults(ayesha, offeringId);
    expect(view.offeringId).toBe(offeringId);
    // Published snapshot still shows the previously approved mark.
    expect(view.groups[0].items[0]).toMatchObject({ name: "Quiz 1", score: "8" });
    // Archived assessments keep their marks.
    expect(await db.assessment.count({ where: { offeringId, archivedAt: { not: null } } })).toBe(3);
  });
});

describe("mapping changes", () => {
  it("stores an official grade column as text (A+, B-) even if submitted as a number (regression)", async () => {
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[0].values = s.sheets[0].values.map((r, i) => [...r, i === 0 ? "GRADE" : ["A+", "B-", null][i - 1]]);
    });
    const mapping = standardMapping(ids);
    // Submitted the way the old editor did: an official grade typed as a number out of 100.
    mapping.assessments.push({ id: null, key: "g", name: "GRADE", groupName: "Evaluation", valueType: "NUMERIC", kind: "OFFICIAL_GRADE", maxScore: "100", columns: [{ googleSheetId: 0, header: "GRADE" }] } as never);
    expect((await saveMapping(faculty, offeringId, mapping)).saved).toBe(true);
    const grade = await db.assessment.findFirstOrThrow({ where: { offeringId, name: "GRADE" } });
    expect(grade).toMatchObject({ valueType: "TEXT", kind: "OFFICIAL_GRADE", maxScore: null });
    expect((await triggerSync(faculty, offeringId)).status).toBe("SUCCEEDED");
    await publishResults(faculty, offeringId, { assessmentIds: [grade.id] });
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    const view = await getStudentCourseResults(ayesha, offeringId);
    expect(view.official).toEqual([expect.objectContaining({ name: "GRADE", status: "SCORED", textValue: "A+", maxScore: null })]);
  });


  it("syncs and publishes attendance-sheet columns (yes/no, count, percentage, status, attendance)", async () => {
    const extra = [
      ["LAB POLICY", "ABSENT", "ATTD. (%)", "ELIGIBILITY", "LAB-1"],
      [true, 0, 1, "ELIGIBLE", 1],
      [false, 1, 0.9, "WARNING", "S"],
      [null, 3, 0.75, "BARRED", 0],
    ];
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[0].values = s.sheets[0].values.map((r, i) => [...r, ...(extra[i] ?? [])]);
    });
    const mapping = standardMapping(ids);
    const add = (key: string, header: string, valueType: string, threshold: string | null = null) =>
      mapping.assessments.push({ id: null, key, name: header, groupName: "Attendance", valueType, kind: "REGULAR", maxScore: null, threshold, columns: [{ googleSheetId: 0, header }] } as never);
    add("pol", "LAB POLICY", "BOOLEAN");
    add("abs", "ABSENT", "COUNT");
    add("pct", "ATTD. (%)", "PERCENT", "90");
    add("elig", "ELIGIBILITY", "STATUS");
    add("l1", "LAB-1", "ATTENDANCE");
    expect((await saveMapping(faculty, offeringId, mapping)).saved).toBe(true);
    expect((await triggerSync(faculty, offeringId)).status).toBe("SUCCEEDED");
    const all = await assessmentIds(offeringId);
    await publishResults(faculty, offeringId, { assessmentIds: ["LAB POLICY", "ABSENT", "ATTD. (%)", "ELIGIBILITY", "LAB-1"].map((n) => all[n]) });

    const items = async (email: string) => {
      const view = await getStudentCourseResults(await studentViewer(email), offeringId);
      return Object.fromEntries(view.groups.flatMap((g) => g.items).map((i) => [i.name, i]));
    };
    const ayesha = await items("ayesha@g.bracu.ac.bd");
    expect(ayesha["LAB POLICY"]).toMatchObject({ valueType: "BOOLEAN", textValue: "Yes" });
    expect(ayesha["ABSENT"]).toMatchObject({ valueType: "COUNT", score: "0", maxScore: null });
    expect(ayesha["ATTD. (%)"]).toMatchObject({ valueType: "PERCENT", score: "100", threshold: "90" });
    expect(ayesha["ELIGIBILITY"]).toMatchObject({ valueType: "STATUS", textValue: "ELIGIBLE" });
    expect(ayesha["LAB-1"]).toMatchObject({ valueType: "ATTENDANCE", textValue: "Present" });
    const second = await items("tanvir@g.bracu.ac.bd");
    expect(second["ATTD. (%)"]).toMatchObject({ score: "90" });
    expect(second["LAB-1"]).toMatchObject({ textValue: "Sick" });
  });

  it("re-adding a removed assessment under the same name keeps the same assessment (regression)", async () => {
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[1].values[0][1] = "Quiz One";
    });
    const mapping = standardMapping(ids);
    mapping.assessments = mapping.assessments.filter((a) => a.name !== "Quiz 1");
    mapping.assessments.push({ id: null, key: "q1b", name: "Quiz 1", groupName: "Quizzes", valueType: "NUMERIC", kind: "REGULAR", maxScore: "10", columns: [{ googleSheetId: 101, header: "Quiz One" }] });
    const result = await saveMapping(faculty, offeringId, mapping);
    expect(result.saved).toBe(true);
    const after = await assessmentIds(offeringId);
    expect(after["Quiz 1"]).toBe(ids["Quiz 1"]);
    expect(await db.assessment.count({ where: { offeringId } })).toBe(4);
    expect((await triggerSync(faculty, offeringId)).status).toBe("SUCCEEDED");
  });
});

describe("authorization and privacy", () => {
  it("rejects other faculty on every management operation without revealing the course", async () => {
    const intruder = await createUser(["FACULTY"]);
    const ops = [
      () => getPublicationOverview(intruder, offeringId),
      () => publishResults(intruder, offeringId, { assessmentIds: [ids["Quiz 1"]] }),
      () => unpublishResults(intruder, offeringId),
      () => triggerSync(intruder, offeringId),
      () => saveMapping(intruder, offeringId, standardMapping(ids)),
      () => verifyConnection(intruder, offeringId),
      () => listSyncRuns(intruder, offeringId),
      () => setArchived(intruder, offeringId, true),
      () => addCoInstructor(intruder, offeringId, "x@bracu.ac.bd"),
    ];
    for (const op of ops) await expect(op()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("prevents connecting another instructor's spreadsheet, but allows reusing your own across sections", async () => {
    const intruder = await createUser(["FACULTY"]);
    const theirs = await createOffering(intruder, { courseCode: "CSE110", courseTitle: "PL I", season: "FALL", year: 2026, section: "09" });
    await expect(connectSpreadsheet(intruder, theirs.id, SPREADSHEET_ID)).rejects.toMatchObject({ code: "CONFLICT" });
    const mySecondSection = await createOffering(faculty, { courseCode: "CSE110", courseTitle: "PL I", season: "FALL", year: 2026, section: "02" });
    await expect(connectSpreadsheet(faculty, mySecondSection.id, SPREADSHEET_ID)).resolves.toMatchObject({ worksheetCount: 3 });
  });

  it("rejects students on management operations", async () => {
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    await expect(publishResults(ayesha, offeringId, { assessmentIds: [ids["Quiz 1"]] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(triggerSync(ayesha, offeringId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createOffering(ayesha, { courseCode: "CSE111", courseTitle: "X", season: "FALL", year: 2026, section: "1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("students cannot open courses they are not enrolled in, even with a valid UUID", async () => {
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    const outsider = await createUser(["STUDENT"], { email: "outsider@g.bracu.ac.bd" });
    await expect(getStudentCourseResults(outsider, offeringId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getStudentCourseResults(outsider, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getStudentCourseResults(outsider, "../../etc/passwd")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listStudentCourses(outsider)).toEqual([]);
  });

  it("removed students lose access to the course", async () => {
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    const nusrat = await studentViewer("nusrat@g.bracu.ac.bd");
    await db.enrollment.updateMany({ where: { studentProfileId: nusrat.profileId }, data: { status: "REMOVED" } });
    await expect(getStudentCourseResults(nusrat, offeringId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("faculty role alone doesn't grant the student view, and suspended viewers are denied", async () => {
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    await expect(getStudentCourseResults(faculty, offeringId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    await db.profile.update({ where: { id: ayesha.profileId }, data: { status: "SUSPENDED" } });
    const suspended = (await loadViewer(db, ayesha.profileId))!;
    await expect(getStudentCourseResults(suspended, offeringId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("faculty preview cannot target an enrollment from another course", async () => {
    const other = await createUser(["FACULTY"]);
    const o2 = await createOffering(other, { courseCode: "MAT110", courseTitle: "Calculus", season: "FALL", year: 2026, section: "1" });
    const foreign = await db.enrollment.create({
      data: { offeringId: o2.id, studentProfileId: (await createUser(["STUDENT"])).profileId },
    });
    await expect(previewAsStudent(faculty, offeringId, { enrollmentId: foreign.id, mode: "draft" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("co-instructors can manage; archived courses are read-only but stay visible to students", async () => {
    await addCoInstructor(faculty, offeringId, "co.teacher@bracu.ac.bd");
    const co = (await loadViewer(db, (await db.profile.findUniqueOrThrow({ where: { email: "co.teacher@bracu.ac.bd" } })).id))!;
    await publishResults(co, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    await expect(setArchived(co, offeringId, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setArchived(faculty, offeringId, true);
    await expect(triggerSync(faculty, offeringId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    const view = await getStudentCourseResults(ayesha, offeringId);
    expect(view.archived).toBe(true);
    expect(view.groups[0].items[0].score).toBe("8");
  });

  it("rejects publishing assessments that belong to another course", async () => {
    const other = await createUser(["FACULTY"]);
    const o2 = await createOffering(other, { courseCode: "MAT110", courseTitle: "Calculus", season: "FALL", year: 2026, section: "1" });
    const g = await db.assessmentGroup.create({ data: { offeringId: o2.id, name: "X" } });
    const foreign = await db.assessment.create({ data: { offeringId: o2.id, groupId: g.id, name: "Foreign", maxScore: "10" } });
    await expect(publishResults(faculty, offeringId, { assessmentIds: [foreign.id] })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("permanent deletion", () => {
  it("deletes the course and all its academic data; students lose access; other data is untouched", async () => {
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    const other = await createUser(["FACULTY"]);
    const keep = await createOffering(other, { courseCode: "MAT110", courseTitle: "Calculus", season: "FALL", year: 2026, section: "1" });
    const ayesha = await studentViewer("ayesha@g.bracu.ac.bd");
    await db.enrollment.create({ data: { offeringId: keep.id, studentProfileId: ayesha.profileId } });

    const summary = await deleteOffering(faculty, offeringId, "cse110-01");
    expect(summary).toMatchObject({ code: "CSE110", section: "01", students: 3, marks: 12, publications: 1 });

    for (const count of [
      db.courseOffering.count({ where: { id: offeringId } }),
      db.enrollment.count({ where: { offeringId } }),
      db.mark.count({ where: { offeringId } }),
      db.assessment.count({ where: { offeringId } }),
      db.publicationSnapshot.count({ where: { offeringId } }),
      db.syncRun.count({ where: { offeringId } }),
      db.sheetSource.count({ where: { offeringId } }),
      db.publishedMark.count(),
      db.sheetWorksheet.count(),
    ]) expect(await count).toBe(0);

    await expect(getStudentCourseResults(ayesha, offeringId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listStudentCourses(ayesha)).map((c) => c.code)).toEqual(["MAT110"]);
    expect(await db.profile.count({ where: { email: "ayesha@g.bracu.ac.bd" } })).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "offering.deleted" } });
    expect(log).toMatchObject({ actorId: faculty.profileId, entityId: offeringId, offeringId: null });
  });

  it("requires the owner, the exact course name, and no running sync", async () => {
    await addCoInstructor(faculty, offeringId, "co@bracu.ac.bd");
    const co = (await loadViewer(db, (await db.profile.findUniqueOrThrow({ where: { email: "co@bracu.ac.bd" } })).id))!;
    await expect(deleteOffering(co, offeringId, "CSE110-01")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const intruder = await createUser(["FACULTY"]);
    await expect(deleteOffering(intruder, offeringId, "CSE110-01")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteOffering(faculty, offeringId, "CSE110")).rejects.toMatchObject({ code: "VALIDATION" });
    const token = await acquireLease(db, offeringId);
    await expect(deleteOffering(faculty, offeringId, "CSE110-01")).rejects.toMatchObject({ code: "SYNC_IN_PROGRESS" });
    await releaseLease(db, offeringId, token!);
    expect(await db.courseOffering.count({ where: { id: offeringId } })).toBe(1);
  });
});

describe("students without an official email (pending access)", () => {
  it("syncs and publishes their marks, hides them from everyone, and links them once the email is added", async () => {
    // Zarif is on the class list with "NA" instead of an email.
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[0].values.push([22109001, "Zarif Haque", "NA", 4]);
      s.sheets[1].values.push([22109001, 9, 8]);
    });
    const first = await triggerSync(faculty, offeringId);
    expect(first.status).toBe("SUCCEEDED");
    await publishResults(faculty, offeringId, { assessmentIds: [ids["Quiz 1"]] });
    const pending = await db.enrollment.findFirstOrThrow({ where: { offeringId, sourceStudentId: "22109001" } });
    expect(pending.studentProfileId).toBeNull();
    expect(await db.publishedMark.count({ where: { enrollmentId: pending.id } })).toBe(1);

    // Faculty can preview exactly what Zarif will see.
    const preview = await previewAsStudent(faculty, offeringId, { enrollmentId: pending.id, mode: "published" });
    expect(preview.groups[0].items[0]).toMatchObject({ name: "Quiz 1", score: "9" });

    // Zarif signs in before the sheet has his email: nothing to see.
    const zarif = await createUser(["STUDENT"], { email: "zarif.haque@g.bracu.ac.bd", studentId: undefined });
    expect(await listStudentCourses(zarif)).toEqual([]);
    await expect(getStudentCourseResults(zarif, offeringId)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The instructor adds his university email; the next sync links him to the same enrollment.
    sheets.update(SPREADSHEET_ID, (s) => {
      const row = s.sheets[0].values.find((r) => r[0] === 22109001)!;
      row[2] = "zarif.haque@g.bracu.ac.bd";
    });
    const second = await triggerSync(faculty, offeringId);
    expect(second.status).toBe("SUCCEEDED");
    expect(second.summary).toContain("1 linked to their accounts");
    const linked = await db.enrollment.findUniqueOrThrow({ where: { id: pending.id } });
    expect(linked.studentProfileId).toBe(zarif.profileId);

    // Already-published marks are visible immediately — no republish needed.
    const view = await getStudentCourseResults(zarif, offeringId);
    expect(view.groups[0].items[0]).toMatchObject({ name: "Quiz 1", score: "9" });
    expect(await db.enrollment.count({ where: { offeringId, sourceStudentId: "22109001" } })).toBe(1);
  });

  it("keeps an already-linked student linked if their email is later blanked in the sheet", async () => {
    const before = await db.enrollment.findFirstOrThrow({ where: { offeringId, student: { email: "ayesha@g.bracu.ac.bd" } } });
    sheets.update(SPREADSHEET_ID, (s) => {
      s.sheets[0].values[1][2] = "NA";
    });
    const outcome = await triggerSync(faculty, offeringId);
    expect(outcome.status).toBe("SUCCEEDED");
    const after = await db.enrollment.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toMatchObject({ status: "ACTIVE", studentProfileId: before.studentProfileId });
    expect(await db.syncIssue.count({ where: { syncRunId: outcome.runId, code: "NO_PORTAL_EMAIL" } })).toBe(0);
  });
});

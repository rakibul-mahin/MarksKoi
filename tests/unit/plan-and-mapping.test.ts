import { describe, expect, it } from "vitest";
import { massRemovalCheck, planMarkWrites } from "@/server/sync/plan";
import { validateMapping, type MappingAssessment, type MappingWorksheet } from "@/lib/mapping-validate";
import type { CellResult } from "@/server/sync/build";

describe("planMarkWrites (idempotency)", () => {
  const cells: CellResult[] = [
    { studentKey: "a", assessmentId: "q1", status: "SCORED", score: "8.00", textValue: null, raw: "8" },
    { studentKey: "a", assessmentId: "q2", status: "MISSING", score: null, textValue: null, raw: null },
    { studentKey: "b", assessmentId: "q1", status: "SCORED", score: "0.00", textValue: null, raw: "0" },
  ];
  const enrollments = new Map([
    ["a", "e-a"],
    ["b", "e-b"],
  ]);

  it("creates everything on first run", () => {
    const plan = planMarkWrites(cells, new Set(), enrollments, []);
    expect(plan).toMatchObject({ created: 3, updated: 0, unchanged: 0 });
  });

  it("writes nothing when re-run with identical data", () => {
    const stored = [
      { enrollmentId: "e-a", assessmentId: "q1", status: "SCORED" as const, score: "8", textValue: null },
      { enrollmentId: "e-a", assessmentId: "q2", status: "MISSING" as const, score: null, textValue: null },
      { enrollmentId: "e-b", assessmentId: "q1", status: "SCORED" as const, score: "0.00", textValue: null },
    ];
    const plan = planMarkWrites(cells, new Set(), enrollments, stored);
    expect(plan).toMatchObject({ writes: [], created: 0, updated: 0, unchanged: 3 });
  });

  it("updates only changed marks and skips invalid cells (keeping previous values)", () => {
    const stored = [
      { enrollmentId: "e-a", assessmentId: "q1", status: "SCORED" as const, score: "7", textValue: null },
      { enrollmentId: "e-b", assessmentId: "q1", status: "SCORED" as const, score: "5", textValue: null },
    ];
    const plan = planMarkWrites(cells, new Set(["b|q1"]), enrollments, stored);
    expect(plan.writes.map((w) => [w.enrollmentId, w.assessmentId, w.isNew])).toEqual([
      ["e-a", "q1", false],
      ["e-a", "q2", true],
    ]);
    expect(plan.skippedInvalid).toBe(1);
  });

  it("guards against mass removal", () => {
    expect(massRemovalCheck(40, 25).ok).toBe(false);
    expect(massRemovalCheck(40, 3).ok).toBe(true);
    expect(massRemovalCheck(4, 4).ok).toBe(true);
  });
});

describe("validateMapping", () => {
  const roster: MappingWorksheet = {
    id: "r",
    title: "Roster",
    enabled: true,
    isRoster: true,
    headerRow: 1,
    studentIdHeader: "Student ID",
    emailHeader: "Email",
    nameHeader: null,
    availableHeaders: ["Student ID", "Email", "Quiz 1"],
  };
  const quizzes: MappingWorksheet = { ...roster, id: "q", title: "Quizzes", isRoster: false, emailHeader: null, availableHeaders: ["Student ID", "Quiz 1", "Quiz 2"] };
  const a = (over: Partial<MappingAssessment>): MappingAssessment => ({
    key: "k1",
    name: "Quiz 1",
    groupName: "Quizzes",
    valueType: "NUMERIC",
    maxScore: "10",
    columns: [{ worksheetId: "q", header: "Quiz 1" }],
    ...over,
  });

  it("accepts a valid configuration", () => {
    const problems = validateMapping([roster, quizzes], [a({}), a({ key: "k2", name: "Quiz 2", columns: [{ worksheetId: "q", header: "Quiz 2" }] })]);
    expect(problems.filter((p) => p.severity === "error")).toEqual([]);
  });

  it("detects the same header existing in another worksheet (ambiguity warning)", () => {
    const problems = validateMapping([roster, quizzes], [a({})]);
    expect(problems.some((p) => p.severity === "warning" && p.message.includes("also appears"))).toBe(true);
  });

  it("rejects duplicate names, missing max marks, identity columns as marks and double-mapped columns", () => {
    const problems = validateMapping(
      [roster, quizzes],
      [
        a({}),
        a({ key: "k2", name: "quiz 1 ", columns: [{ worksheetId: "q", header: "Quiz 2" }] }),
        a({ key: "k3", name: "Bad max", maxScore: "0", columns: [{ worksheetId: "q", header: "Student ID" }] }),
        a({ key: "k4", name: "Dup col", columns: [{ worksheetId: "q", header: "Quiz 1" }] }),
      ],
    ).filter((p) => p.severity === "error");
    const text = problems.map((p) => p.message).join("\n");
    expect(text).toContain("Names must be unique");
    expect(text).toContain("maximum mark");
    expect(text).toContain("identity column");
    expect(text).toContain("more than one assessment");
  });

  it("requires a roster with an email column", () => {
    const problems = validateMapping([{ ...roster, emailHeader: null }, quizzes], [a({})]);
    expect(problems.some((p) => p.message.includes("roster needs a student email"))).toBe(true);
    expect(validateMapping([{ ...roster, isRoster: false }, quizzes], [a({})]).some((p) => p.path === "roster")).toBe(true);
  });
});

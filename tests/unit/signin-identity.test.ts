import { describe, expect, it } from "vitest";
import { decideSignIn, type SignInFacts } from "@/server/auth/sign-in-policy";
import { resolveIdentities } from "@/server/sync/identity";
import type { RosterStudent } from "@/server/sync/build";

const base: SignInFacts = {
  claims: { email: "s@g.bracu.ac.bd", email_verified: true },
  domains: { studentDomains: ["g.bracu.ac.bd"], facultyDomains: ["bracu.ac.bd"] },
  accountProfile: null,
  emailProfile: null,
  currentSessionProfileId: null,
};

describe("decideSignIn", () => {
  it("allows a brand-new verified student", () => {
    expect(decideSignIn(base)).toEqual({ ok: true, email: "s@g.bracu.ac.bd", baselineRole: "STUDENT", profileId: null });
  });
  it("rejects unverified emails and disallowed domains", () => {
    expect(decideSignIn({ ...base, claims: { email: "s@g.bracu.ac.bd", email_verified: false } })).toEqual({ ok: false, reason: "EMAIL_NOT_VERIFIED" });
    expect(decideSignIn({ ...base, claims: { email: "s@gmail.com", email_verified: true } })).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });
  });
  it("links to an unclaimed roster profile", () => {
    expect(decideSignIn({ ...base, emailProfile: { id: "p1", status: "ACTIVE", hasGoogleAccount: false } })).toMatchObject({ ok: true, profileId: "p1" });
  });
  it("refuses relinking an email whose profile already has a different Google account", () => {
    expect(decideSignIn({ ...base, emailProfile: { id: "p1", status: "ACTIVE", hasGoogleAccount: true } })).toEqual({ ok: false, reason: "GOOGLE_ACCOUNT_CHANGED" });
  });
  it("refuses suspended accounts either way", () => {
    expect(decideSignIn({ ...base, accountProfile: { id: "p1", status: "SUSPENDED" } })).toEqual({ ok: false, reason: "SUSPENDED" });
    expect(decideSignIn({ ...base, emailProfile: { id: "p1", status: "SUSPENDED", hasGoogleAccount: false } })).toEqual({ ok: false, reason: "SUSPENDED" });
  });
  it("refuses when another person is signed in in the same browser", () => {
    expect(decideSignIn({ ...base, currentSessionProfileId: "other" })).toEqual({ ok: false, reason: "SIGNED_IN_AS_OTHER" });
    expect(decideSignIn({ ...base, accountProfile: { id: "me", status: "ACTIVE" }, currentSessionProfileId: "me" })).toMatchObject({ ok: true });
  });
});

const roster = (...rows: Array<[string, string | null]>): Array<RosterStudent & { email: string }> =>
  rows.map(([email, studentId], i) => ({ key: email, email, studentId, name: null, row: i + 2 }));

let n = 0;
const newId = () => `new-${++n}`;

describe("resolveIdentities", () => {
  it("matches by email, creates missing profiles and fills in missing student ids", () => {
    const r = resolveIdentities(roster(["a@x", "1"], ["b@x", "2"]), [{ id: "pa", email: "a@x", studentId: null }], newId, "Roster");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profileByStudentKey.get("a@x")).toBe("pa");
    expect(r.creates).toHaveLength(1);
    expect(r.studentIdUpdates).toEqual([{ profileId: "pa", studentId: "1" }]);
  });

  it("never attaches marks by student id alone when the email differs", () => {
    const r = resolveIdentities(roster(["new@x", "1"]), [{ id: "pa", email: "a@x", studentId: "1" }], newId, "Roster");
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ code: "IDENTITY_CONFLICT", structural: true, rowNumber: 2 });
  });

  it("aborts when email and id point at different accounts", () => {
    const r = resolveIdentities(
      roster(["a@x", "2"]),
      [
        { id: "pa", email: "a@x", studentId: "1" },
        { id: "pb", email: "b@x", studentId: "2" },
      ],
      newId,
      "Roster",
    );
    expect(r.ok).toBe(false);
  });

  it("warns (but matches by email) when the account's stored id differs", () => {
    const r = resolveIdentities(roster(["a@x", "9"]), [{ id: "pa", email: "a@x", studentId: "1" }], newId, "Roster");
    expect(r.ok).toBe(true);
    expect(r.issues[0]).toMatchObject({ code: "STUDENT_ID_DIFFERS", severity: "WARNING" });
  });
});

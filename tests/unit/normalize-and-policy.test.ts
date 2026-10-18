import { describe, expect, it } from "vitest";
import { classifyEmail, verifyGoogleClaims } from "@/server/auth/domain-policy";
import { columnLetter, normalizeCourseCode, normalizeEmail, normalizeHeader, normalizeSection, normalizeStudentId } from "@/lib/normalize";
import { parseSpreadsheetId, wholeSheetRange } from "@/server/sheets/spreadsheet-id";

const policy = { studentDomains: ["g.bracu.ac.bd"], facultyDomains: ["bracu.ac.bd"] };

describe("normalization", () => {
  it("normalizes emails and rejects junk", () => {
    expect(normalizeEmail("  Rahim.Uddin@G.BRACU.AC.BD ")).toBe("rahim.uddin@g.bracu.ac.bd");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it("normalizes student ids from numbers and messy strings", () => {
    expect(normalizeStudentId(22101234)).toBe("22101234");
    expect(normalizeStudentId(" 2210 1234 ")).toBe("22101234");
    expect(normalizeStudentId("'22101234")).toBe("22101234");
    expect(normalizeStudentId(22.5)).toBeNull();
    expect(normalizeStudentId("id#1")).toBeNull();
    expect(normalizeStudentId("")).toBeNull();
  });

  it("normalizes headers, course codes and sections", () => {
    expect(normalizeHeader("  Quiz   1 ")).toBe("quiz 1");
    expect(normalizeCourseCode("cse 110")).toBe("CSE110");
    expect(normalizeSection("1")).toBe("01");
    expect(normalizeSection("a")).toBe("A");
  });

  it("converts column indexes to letters", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(701)).toBe("ZZ");
  });
});

describe("domain policy", () => {
  it("uses exact domains: g.bracu.ac.bd is a student, bracu.ac.bd is faculty", () => {
    expect(classifyEmail("s@g.bracu.ac.bd", policy)).toEqual({ ok: true, role: "STUDENT", email: "s@g.bracu.ac.bd" });
    expect(classifyEmail("t@bracu.ac.bd", policy)).toEqual({ ok: true, role: "FACULTY", email: "t@bracu.ac.bd" });
  });

  it("rejects other and look-alike domains", () => {
    expect(classifyEmail("x@gmail.com", policy)).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });
    expect(classifyEmail("x@evilbracu.ac.bd", policy)).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });
    expect(classifyEmail("x@bracu.ac.bd.evil.com", policy)).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });
    expect(classifyEmail("x@sub.g.bracu.ac.bd", policy)).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });
  });

  it("fails closed when a domain is configured for both roles", () => {
    expect(classifyEmail("x@bracu.ac.bd", { studentDomains: ["bracu.ac.bd"], facultyDomains: ["bracu.ac.bd"] })).toEqual({
      ok: false,
      reason: "DOMAIN_AMBIGUOUS",
    });
  });

  it("never grants ADMIN from a domain", () => {
    const r = classifyEmail("admin@bracu.ac.bd", policy);
    expect(r.ok && r.role).not.toBe("ADMIN");
  });

  it("requires verified Google emails and a matching hosted domain", () => {
    expect(verifyGoogleClaims({ email: "s@g.bracu.ac.bd", email_verified: true, hd: "g.bracu.ac.bd" })).toEqual({ ok: true, email: "s@g.bracu.ac.bd" });
    expect(verifyGoogleClaims({ email: "s@g.bracu.ac.bd", email_verified: false })).toEqual({ ok: false, reason: "EMAIL_NOT_VERIFIED" });
    expect(verifyGoogleClaims({ email: "s@g.bracu.ac.bd", email_verified: "true" })).toEqual({ ok: false, reason: "EMAIL_NOT_VERIFIED" });
    expect(verifyGoogleClaims({ email: "s@g.bracu.ac.bd", email_verified: true, hd: "other.edu" })).toEqual({ ok: false, reason: "HOSTED_DOMAIN_MISMATCH" });
  });
});

describe("spreadsheet id parsing", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd";
  it("accepts URLs and bare ids", () => {
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/u/1/d/${id}/edit?usp=sharing`)).toBe(id);
    expect(parseSpreadsheetId(`  ${id}  `)).toBe(id);
  });
  it("rejects other hosts, drive file links and junk", () => {
    expect(parseSpreadsheetId(`https://evil.com/spreadsheets/d/${id}`)).toBeNull();
    expect(parseSpreadsheetId(`http://docs.google.com/spreadsheets/d/${id}`)).toBeNull();
    expect(parseSpreadsheetId(`https://drive.google.com/file/d/${id}/view`)).toBeNull();
    expect(parseSpreadsheetId("short")).toBeNull();
  });
  it("quotes worksheet titles for A1 ranges", () => {
    expect(wholeSheetRange("Quiz's")).toBe("'Quiz''s'");
  });
});

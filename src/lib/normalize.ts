/**
 * Pure normalization helpers shared by the sync engine, forms and tests.
 * Identity values coming from spreadsheets are untrusted and messy (stray spaces, mixed case,
 * numbers instead of strings), so every comparison goes through these functions.
 */

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Lower-cases and trims an email; returns null when it is not a plausible address. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

/**
 * Student IDs may arrive as numbers (22101234) or strings (" 22101234 ", "'22101234").
 * Internal whitespace and a leading apostrophe (Sheets text marker) are removed.
 */
export function normalizeStudentId(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
    return String(value);
  }
  if (typeof value !== "string") return null;
  const id = value.replace(/^'/, "").replace(/\s+/g, "").toUpperCase();
  if (!id || id.length > 32 || !/^[A-Z0-9_-]+$/.test(id)) return null;
  return id;
}

/** Header comparison key: trimmed, internal whitespace collapsed, case-insensitive. */
export function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

/** Display form of a header: trimmed with collapsed whitespace. */
export function cleanHeader(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

/** "cse 110" → "CSE110". */
export function normalizeCourseCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** "1" → "01"; non-numeric sections are trimmed and upper-cased ("A" → "A"). */
export function normalizeSection(value: string): string {
  const v = value.trim().toUpperCase();
  return /^\d+$/.test(v) ? v.padStart(2, "0") : v;
}

export function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name ? name.slice(0, 200) : null;
}

/** 0-based column index → A1 column letters (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

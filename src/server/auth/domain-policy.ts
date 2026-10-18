import { emailDomain, normalizeEmail } from "@/lib/normalize";

/**
 * Maps a verified Google email to the baseline role its domain allows. Matching is by exact
 * domain (x@g.bracu.ac.bd is NOT bracu.ac.bd). Misconfiguration where a domain appears in both
 * lists fails closed. Administrator access is never derived from a domain.
 */
export type BaselineRole = "STUDENT" | "FACULTY";

export type DomainDecision =
  | { ok: true; role: BaselineRole; email: string }
  | { ok: false; reason: "INVALID_EMAIL" | "DOMAIN_NOT_ALLOWED" | "DOMAIN_AMBIGUOUS" };

export function classifyEmail(
  rawEmail: unknown,
  config: { studentDomains: string[]; facultyDomains: string[] },
): DomainDecision {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: "INVALID_EMAIL" };
  const domain = emailDomain(email);
  const isStudent = config.studentDomains.includes(domain);
  const isFaculty = config.facultyDomains.includes(domain);
  if (isStudent && isFaculty) return { ok: false, reason: "DOMAIN_AMBIGUOUS" };
  if (isStudent) return { ok: true, role: "STUDENT", email };
  if (isFaculty) return { ok: true, role: "FACULTY", email };
  return { ok: false, reason: "DOMAIN_NOT_ALLOWED" };
}

/**
 * Validates the Google ID-token claims we rely on. `hd` (hosted domain) is present for Google
 * Workspace accounts; when present it must equal the email's domain.
 */
export function verifyGoogleClaims(profile: {
  email?: unknown;
  email_verified?: unknown;
  hd?: unknown;
}): { ok: true; email: string } | { ok: false; reason: "EMAIL_NOT_VERIFIED" | "INVALID_EMAIL" | "HOSTED_DOMAIN_MISMATCH" } {
  const email = normalizeEmail(profile.email);
  if (!email) return { ok: false, reason: "INVALID_EMAIL" };
  if (profile.email_verified !== true) return { ok: false, reason: "EMAIL_NOT_VERIFIED" };
  if (profile.hd !== undefined && profile.hd !== null) {
    if (typeof profile.hd !== "string" || profile.hd.toLowerCase() !== emailDomain(email)) {
      return { ok: false, reason: "HOSTED_DOMAIN_MISMATCH" };
    }
  }
  return { ok: true, email };
}

export const SIGN_IN_DENIAL_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: "We couldn't read a valid email address from your Google account.",
  EMAIL_NOT_VERIFIED: "Your Google account email isn't verified.",
  HOSTED_DOMAIN_MISMATCH: "Your Google account's organization doesn't match its email domain.",
  DOMAIN_NOT_ALLOWED: "Please sign in with your university Google account.",
  DOMAIN_AMBIGUOUS: "Your email domain is configured for more than one role. An administrator needs to fix the configuration.",
  SUSPENDED: "Your account has been suspended. Contact an administrator.",
  EMAIL_CONFLICT: "Your email address is already linked to a different account. Contact an administrator.",
  NO_ROLE: "Your account doesn't have access to MarksKoi yet. Contact an administrator.",
  GOOGLE_ACCOUNT_CHANGED: "This email was previously used with a different Google account. An administrator needs to reset the link before you can sign in.",
  SIGNED_IN_AS_OTHER: "Someone else is signed in on this browser. Sign out first, then sign in with your own account.",
  UNAVAILABLE: "Sign-in is temporarily unavailable. Please try again in a few minutes.",
  FORBIDDEN: "Your account doesn't have access to that area.",
};

import { classifyEmail, verifyGoogleClaims, type BaselineRole } from "./domain-policy";

/**
 * Decides whether a Google sign-in may proceed, given facts loaded from the database.
 * Pure function so every branch is unit-tested. Fails closed on anything unexpected.
 */
export type SignInFacts = {
  claims: { email?: unknown; email_verified?: unknown; hd?: unknown };
  domains: { studentDomains: string[]; facultyDomains: string[] };
  /** Profile already linked to this Google account (by Google `sub`), if any. */
  accountProfile: { id: string; status: "ACTIVE" | "SUSPENDED" } | null;
  /** Profile that currently owns the verified email, if any. */
  emailProfile: { id: string; status: "ACTIVE" | "SUSPENDED"; hasGoogleAccount: boolean } | null;
  /** Profile of a session already present in the browser, if any. */
  currentSessionProfileId: string | null;
};

export type SignInDecision =
  | { ok: true; email: string; baselineRole: BaselineRole; profileId: string | null }
  | { ok: false; reason: string };

export function decideSignIn(f: SignInFacts): SignInDecision {
  const claims = verifyGoogleClaims(f.claims);
  if (!claims.ok) return { ok: false, reason: claims.reason };
  const domain = classifyEmail(claims.email, f.domains);
  if (!domain.ok) return { ok: false, reason: domain.reason };

  let target: string | null = null;
  if (f.accountProfile) {
    if (f.accountProfile.status === "SUSPENDED") return { ok: false, reason: "SUSPENDED" };
    if (f.emailProfile && f.emailProfile.id !== f.accountProfile.id) return { ok: false, reason: "EMAIL_CONFLICT" };
    target = f.accountProfile.id;
  } else if (f.emailProfile) {
    if (f.emailProfile.status === "SUSPENDED") return { ok: false, reason: "SUSPENDED" };
    // The email's profile is linked to a *different* Google account (e.g. the Google account was
    // deleted and recreated). Don't silently re-link; an administrator must reset the link.
    if (f.emailProfile.hasGoogleAccount) return { ok: false, reason: "GOOGLE_ACCOUNT_CHANGED" };
    target = f.emailProfile.id;
  }

  if (f.currentSessionProfileId && f.currentSessionProfileId !== target) {
    return { ok: false, reason: "SIGNED_IN_AS_OTHER" };
  }
  return { ok: true, email: domain.email, baselineRole: domain.role, profileId: target };
}

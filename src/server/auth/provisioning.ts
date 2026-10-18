import "server-only";
import { normalizeEmail } from "@/lib/normalize";
import type { Db } from "../db";
import { getDomainPolicyConfig } from "../env";
import { logger } from "../logger";
import { recordAudit } from "../services/audit";
import { classifyEmail } from "./domain-policy";
import type { SignInFacts } from "./sign-in-policy";

/** Loads the database facts `decideSignIn` needs. */
export async function loadSignInFacts(
  db: Db,
  input: { provider: string; providerAccountId: string; claims: SignInFacts["claims"]; sessionToken: string | null },
): Promise<SignInFacts> {
  const email = normalizeEmail(input.claims.email);
  const [account, emailProfile, session] = await Promise.all([
    db.account.findUnique({
      where: { provider_providerAccountId: { provider: input.provider, providerAccountId: input.providerAccountId } },
      select: { profile: { select: { id: true, status: true } } },
    }),
    email
      ? db.profile.findUnique({
          where: { email },
          select: { id: true, status: true, accounts: { where: { provider: input.provider }, select: { id: true } } },
        })
      : null,
    input.sessionToken
      ? db.session.findUnique({ where: { sessionToken: input.sessionToken }, select: { profileId: true, expires: true } })
      : null,
  ]);
  return {
    claims: input.claims,
    domains: getDomainPolicyConfig(),
    accountProfile: account?.profile ?? null,
    emailProfile: emailProfile ? { id: emailProfile.id, status: emailProfile.status, hasGoogleAccount: emailProfile.accounts.length > 0 } : null,
    currentSessionProfileId: session && session.expires.getTime() > Date.now() ? session.profileId : null,
  };
}

/**
 * Runs after a successful sign-in: refreshes identity fields (including an email changed in
 * Google Workspace for the same Google account), marks the profile as claimed, and grants the
 * domain's baseline role unless an administrator previously revoked it.
 */
export async function provisionAfterSignIn(
  db: Db,
  profileId: string,
  google: { email?: unknown; name?: unknown; picture?: unknown },
): Promise<void> {
  const email = normalizeEmail(google.email);
  if (!email) return;
  const decision = classifyEmail(email, getDomainPolicyConfig());
  const now = new Date();
  await db.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({ where: { id: profileId } });
    if (!profile) return;
    const data: Record<string, unknown> = { lastSignInAt: now, emailVerified: now };
    if (!profile.claimedAt) data.claimedAt = now;
    if (profile.email !== email) {
      const taken = await tx.profile.findUnique({ where: { email }, select: { id: true } });
      if (!taken) data.email = email;
      else logger.warn("auth.email_change_conflict", { profileId });
    }
    if (typeof google.name === "string" && google.name.trim()) data.name = google.name.trim().slice(0, 200);
    if (typeof google.picture === "string" && google.picture.startsWith("https://")) data.image = google.picture;
    await tx.profile.update({ where: { id: profileId }, data });

    if (decision.ok) {
      await tx.userRole.createMany({ data: [{ profileId, role: decision.role }], skipDuplicates: true });
    }
    await recordAudit(tx, { actorId: profileId, action: "auth.sign_in", entityType: "profile", entityId: profileId });
  });
}

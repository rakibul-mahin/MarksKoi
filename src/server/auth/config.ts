import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { emailDomain, normalizeEmail } from "@/lib/normalize";
import { db } from "../db";
import { logger } from "../logger";
import { recordAudit } from "../services/audit";
import { syncScoreAdapter } from "./adapter";
import { loadSignInFacts, provisionAfterSignIn } from "./provisioning";
import { decideSignIn } from "./sign-in-policy";

export const SESSION_COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"] as const;
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

async function currentSessionToken(): Promise<string | null> {
  const store = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    const value = store.get(name)?.value;
    if (value) return value;
  }
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: syncScoreAdapter(db),
  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 24 * 60 * 60,
  },
  providers: [
    Google({
      // Pre-provisioned roster profiles are linked on first sign-in by verified email. This is
      // safe here because Google is the only identity provider, `email_verified` and the domain
      // allow-list are enforced in `signIn`, and a profile can hold at most one Google account.
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || account.provider !== "google" || !profile) return "/unauthorized?reason=INVALID_EMAIL";
      try {
        const facts = await loadSignInFacts(db, {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          claims: { email: profile.email, email_verified: profile.email_verified, hd: (profile as { hd?: unknown }).hd },
          sessionToken: await currentSessionToken(),
        });
        const decision = decideSignIn(facts);
        if (!decision.ok) {
          const email = normalizeEmail(profile.email);
          logger.warn("auth.sign_in_denied", { reason: decision.reason, domain: email ? emailDomain(email) : null });
          await recordAudit(db, {
            actorId: facts.accountProfile?.id ?? facts.emailProfile?.id ?? null,
            action: "auth.sign_in_denied",
            entityType: "profile",
            metadata: { reason: decision.reason, domain: email ? emailDomain(email) : null },
          }).catch(() => undefined);
          return `/unauthorized?reason=${decision.reason}`;
        }
        return true;
      } catch (err) {
        logger.error("auth.sign_in_check_failed", { err });
        return "/unauthorized?reason=UNAVAILABLE";
      }
    },
    async session({ session, user }) {
      // Expose only the stable profile id; roles are always re-read on the server.
      return { ...session, user: { id: user.id, name: user.name, email: user.email, image: user.image } };
    },
  },
  events: {
    async signIn({ user, profile }) {
      if (!user.id || !profile) return;
      try {
        await provisionAfterSignIn(db, user.id, { email: profile.email, name: profile.name, picture: (profile as { picture?: unknown }).picture });
      } catch (err) {
        logger.error("auth.provisioning_failed", { profileId: user.id, err });
      }
    },
  },
  logger: {
    error: (error) => logger.error("authjs.error", { err: error }),
    warn: (code) => logger.warn("authjs.warn", { code }),
  },
});

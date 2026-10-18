import "server-only";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { normalizeEmail } from "@/lib/normalize";
import type { Db } from "../db";

/**
 * Auth.js adapter over SyncScore's own tables (profiles / accounts / sessions).
 * - Emails are canonicalized to lower case.
 * - OAuth tokens are never stored: the platform only needs the user's identity.
 */
type ProfileRow = { id: string; email: string; emailVerified: Date | null; name: string | null; image: string | null };

const toAdapterUser = (p: ProfileRow): AdapterUser => ({
  id: p.id,
  email: p.email,
  emailVerified: p.emailVerified,
  name: p.name,
  image: p.image,
});

const select = { id: true, email: true, emailVerified: true, name: true, image: true } as const;

export function syncScoreAdapter(db: Db): Adapter {
  return {
    async createUser(user) {
      const email = normalizeEmail(user.email);
      if (!email) throw new Error("Cannot create a profile without a valid email.");
      const profile = await db.profile.create({
        data: { email, name: user.name ?? null, image: user.image ?? null, emailVerified: user.emailVerified ?? null },
        select,
      });
      return toAdapterUser(profile);
    },
    async getUser(id) {
      const p = await db.profile.findUnique({ where: { id }, select });
      return p ? toAdapterUser(p) : null;
    },
    async getUserByEmail(email) {
      const normalized = normalizeEmail(email);
      if (!normalized) return null;
      const p = await db.profile.findUnique({ where: { email: normalized }, select });
      return p ? toAdapterUser(p) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const account = await db.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { profile: { select } },
      });
      return account ? toAdapterUser(account.profile) : null;
    },
    async updateUser(user) {
      const data: { name?: string | null; image?: string | null; emailVerified?: Date | null } = {};
      if (user.name !== undefined) data.name = user.name;
      if (user.image !== undefined) data.image = user.image;
      if (user.emailVerified !== undefined) data.emailVerified = user.emailVerified;
      const p = await db.profile.update({ where: { id: user.id }, data, select });
      return toAdapterUser(p);
    },
    async linkAccount(account) {
      // Unique (profile_id, provider) makes this fail if the profile already has a Google account.
      await db.account.create({
        data: {
          profileId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
      });
    },
    async createSession(session) {
      const s = await db.session.create({
        data: { sessionToken: session.sessionToken, profileId: session.userId, expires: session.expires },
      });
      return { sessionToken: s.sessionToken, userId: s.profileId, expires: s.expires };
    },
    async getSessionAndUser(sessionToken) {
      const s = await db.session.findUnique({ where: { sessionToken }, include: { profile: { select } } });
      if (!s) return null;
      if (s.expires.getTime() < Date.now()) {
        await db.session.deleteMany({ where: { sessionToken } });
        return null;
      }
      return {
        session: { sessionToken: s.sessionToken, userId: s.profileId, expires: s.expires },
        user: toAdapterUser(s.profile),
      };
    },
    async updateSession(session) {
      const s = await db.session.update({
        where: { sessionToken: session.sessionToken },
        data: { ...(session.expires ? { expires: session.expires } : {}) },
      }).catch(() => null);
      return s ? { sessionToken: s.sessionToken, userId: s.profileId, expires: s.expires } : null;
    },
    async deleteSession(sessionToken) {
      await db.session.deleteMany({ where: { sessionToken } });
    },
  };
}

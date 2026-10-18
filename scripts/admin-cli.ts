/**
 * Administrator bootstrap CLI. Grants or revokes roles directly in the database for whoever
 * runs it with DATABASE_URL access (the first administrator can't be created from the UI).
 * Every change is recorded in the audit log.
 *
 * Usage:
 *   pnpm admin:grant  someone@bracu.ac.bd [ADMIN|FACULTY|STUDENT]
 *   pnpm admin:revoke someone@bracu.ac.bd [ADMIN|FACULTY|STUDENT]
 *   pnpm admin:list
 */
import { db } from "@/server/db";
import { normalizeEmail } from "@/lib/normalize";

const [command, rawEmail, rawRole = "ADMIN"] = process.argv.slice(2);
const ROLES = ["ADMIN", "FACULTY", "STUDENT"] as const;

async function main() {
  if (command === "list") {
    const admins = await db.userRole.findMany({ where: { role: "ADMIN", revokedAt: null }, include: { profile: { select: { email: true } } } });
    console.log(admins.length ? admins.map((a) => a.profile.email).join("\n") : "No administrators.");
    return;
  }
  const email = normalizeEmail(rawEmail);
  const role = ROLES.find((r) => r === rawRole.toUpperCase());
  if (!email || !role || (command !== "grant" && command !== "revoke")) {
    console.error("Usage: admin-cli <grant|revoke> <email> [ADMIN|FACULTY|STUDENT]  |  admin-cli list");
    process.exitCode = 1;
    return;
  }
  const profile = await db.profile.upsert({ where: { email }, update: {}, create: { email } });
  await db.$transaction(async (tx) => {
    await tx.userRole.upsert({
      where: { profileId_role: { profileId: profile.id, role } },
      update: command === "grant" ? { revokedAt: null, revokedById: null, grantedAt: new Date(), reason: "admin-cli" } : { revokedAt: new Date(), reason: "admin-cli" },
      create: command === "grant" ? { profileId: profile.id, role, reason: "admin-cli" } : { profileId: profile.id, role, revokedAt: new Date(), reason: "admin-cli" },
    });
    await tx.auditLog.create({
      data: { actorId: null, action: command === "grant" ? "role.granted" : "role.revoked", entityType: "profile", entityId: profile.id, metadata: { role, via: "admin-cli" } },
    });
  });
  console.log(`${command === "grant" ? "Granted" : "Revoked"} ${role} ${command === "grant" ? "to" : "from"} ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

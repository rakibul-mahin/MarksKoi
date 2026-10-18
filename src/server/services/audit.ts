import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "../db";

export type AuditAction =
  | "offering.created"
  | "offering.updated"
  | "offering.archived"
  | "offering.restored"
  | "offering.deleted"
  | "offering.faculty_added"
  | "offering.faculty_removed"
  | "source.connected"
  | "source.verified"
  | "source.replaced"
  | "mapping.saved"
  | "sync.manual"
  | "publication.published"
  | "publication.unpublished"
  | "publication.auto_published"
  | "role.granted"
  | "role.revoked"
  | "profile.suspended"
  | "profile.reactivated"
  | "sessions.revoked"
  | "admin.viewed_user"
  | "admin.sync_recovered"
  | "auth.sign_in"
  | "auth.sign_in_denied";

export async function recordAudit(
  client: Tx | typeof db,
  entry: {
    actorId: string | null;
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    offeringId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      offeringId: entry.offeringId ?? null,
      metadata: entry.metadata,
    },
  });
}

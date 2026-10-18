import "server-only";
import { randomUUID } from "node:crypto";
import type { Db, Tx } from "../db";

/**
 * Database-backed per-offering lease. Acquisition is a single conditional UPDATE, so two
 * concurrent requests cannot both win. The lease expires on its own if a process dies, and the
 * apply transaction re-checks the token (fencing) before writing.
 */
export const LEASE_SECONDS = 120;

export async function acquireLease(client: Db, offeringId: string, seconds = LEASE_SECONDS): Promise<string | null> {
  const token = randomUUID();
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    UPDATE course_offerings
       SET sync_lease_token = ${token}, sync_lease_until = now() + make_interval(secs => ${seconds}::int)
     WHERE id = ${offeringId}::uuid
       AND (sync_lease_until IS NULL OR sync_lease_until < now())
    RETURNING id`;
  return rows.length === 1 ? token : null;
}

export async function releaseLease(client: Db, offeringId: string, token: string): Promise<void> {
  await client.$executeRaw`
    UPDATE course_offerings SET sync_lease_token = NULL, sync_lease_until = NULL
     WHERE id = ${offeringId}::uuid AND sync_lease_token = ${token}`;
}

/** Inside the apply transaction: lock the offering row and confirm we still hold the lease. */
export async function assertLeaseHeld(tx: Tx, offeringId: string, token: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ ok: boolean }>>`
    SELECT (sync_lease_token = ${token} AND sync_lease_until > now()) AS ok
      FROM course_offerings WHERE id = ${offeringId}::uuid FOR UPDATE`;
  return rows[0]?.ok === true;
}

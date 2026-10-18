import { randomBytes } from "node:crypto";
import pg from "pg";

/**
 * Test-only helpers that talk to the E2E database directly. Signing in is simulated by
 * inserting an Auth.js database session row and setting its cookie in the browser — exactly
 * what a successful Google sign-in produces. The application itself has no bypass.
 */
export function e2eDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set");
  return url;
}

export async function withClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function createSessionFor(email: string, opts: { expiresInMs?: number } = {}): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await withClient(async (c) => {
    const { rows } = await c.query<{ id: string }>("SELECT id FROM profiles WHERE email = $1", [email.toLowerCase()]);
    if (!rows[0]) throw new Error(`No profile for ${email}`);
    await c.query("INSERT INTO sessions (id, session_token, profile_id, expires) VALUES (gen_random_uuid(), $1, $2, $3)", [
      token,
      rows[0].id,
      new Date(Date.now() + (opts.expiresInMs ?? 3600_000)),
    ]);
  });
  return token;
}

export const SESSION_COOKIE = "authjs.session-token";

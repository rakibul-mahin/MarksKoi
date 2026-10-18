import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { withClient } from "./support/db";
import { E2E_FIXTURE_ITEMS, writeFixture } from "./support/fixture";

/**
 * Prepares the isolated E2E database: applies migrations (non-destructive), truncates data
 * (only on a *_e2e database), writes the runtime fixture spreadsheets and seeds realistic data
 * through the real services.
 */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL!;
  if (!new URL(url).pathname.endsWith("_e2e")) throw new Error("E2E database name must end with _e2e");
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" };
  execSync("pnpm -s prisma migrate deploy", { env, stdio: "pipe" });

  await withClient(async (c) => {
    const { rows } = await c.query<{ tablename: string }>("SELECT tablename::text FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'");
    await c.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  });

  mkdirSync("e2e/.runtime", { recursive: true });
  const dev = JSON.parse(readFileSync("fixtures/sheets.dev.json", "utf8"));
  writeFixture({ ...dev, ...E2E_FIXTURE_ITEMS });
  copyFileSync("e2e/.runtime/sheets.json", "e2e/.runtime/sheets.initial.json");

  execSync("pnpm -s exec tsx --conditions=react-server scripts/seed.ts", {
    env: { ...env, SHEETS_DRIVER: "fixture", SHEETS_FIXTURE_FILE: "e2e/.runtime/sheets.json", STUDENT_EMAIL_DOMAINS: "g.bracu.ac.bd", FACULTY_EMAIL_DOMAINS: "bracu.ac.bd", LOG_SILENT: "1" },
    stdio: "pipe",
  });

  // Extra people used by the journeys.
  await withClient(async (c) => {
    for (const [email, name, role] of [
      ["new.faculty@bracu.ac.bd", "Dr. Nadia Sultana", "FACULTY"],
      ["other.faculty@bracu.ac.bd", "Other Faculty", "FACULTY"],
      ["outsider@g.bracu.ac.bd", "Outside Student", "STUDENT"],
    ] as const) {
      const { rows } = await c.query<{ id: string }>("INSERT INTO profiles (id, email, name, updated_at) VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id", [email, name]);
      await c.query("INSERT INTO user_roles (id, profile_id, role) VALUES (gen_random_uuid(), $1, $2)", [rows[0].id, role]);
    }
  });
  writeFileSync("e2e/.runtime/ready", new Date().toISOString());
}

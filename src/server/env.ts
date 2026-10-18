import "server-only";
import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Environment access is validated lazily at each service boundary so that, for example, a page
 * that never touches Google Sheets still renders when Sheets credentials are missing. Error
 * messages name the missing variables but never print their values.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function read<T extends z.ZodType>(schema: T, values: Record<string, unknown>, area: string): z.infer<T> {
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "?")))];
    throw new ConfigError(`Missing or invalid ${area} configuration: ${names.join(", ")}. See .env.example.`);
  }
  return parsed.data;
}

const domainList = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean),
  )
  .pipe(z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).min(1));

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getDatabaseUrl(): string {
  return read(z.object({ DATABASE_URL: z.string().min(1) }), process.env, "database").DATABASE_URL;
}

export type DomainPolicyConfig = { studentDomains: string[]; facultyDomains: string[] };

export function getDomainPolicyConfig(): DomainPolicyConfig {
  const env = read(
    z.object({ STUDENT_EMAIL_DOMAINS: domainList, FACULTY_EMAIL_DOMAINS: domainList }),
    process.env,
    "email domain",
  );
  return { studentDomains: env.STUDENT_EMAIL_DOMAINS, facultyDomains: env.FACULTY_EMAIL_DOMAINS };
}

export function getAppUrl(): string {
  const value = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.URL ?? "http://localhost:3000";
  return value.replace(/\/+$/, "");
}

export type SheetsConfig =
  | { driver: "google"; clientEmail: string; privateKey: string }
  | { driver: "fixture"; fixtureFile: string; clientEmail: string };

export function getSheetsConfig(): SheetsConfig {
  const driver = (process.env.SHEETS_DRIVER ?? "google").trim();
  if (driver === "fixture") {
    if (isProduction()) {
      throw new ConfigError("SHEETS_DRIVER=fixture is not allowed in production.");
    }
    const env = read(z.object({ SHEETS_FIXTURE_FILE: z.string().min(1) }), process.env, "Sheets fixture");
    return {
      driver: "fixture",
      fixtureFile: env.SHEETS_FIXTURE_FILE,
      clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "fixture-service-account@example.invalid",
    };
  }
  if (driver !== "google") throw new ConfigError("SHEETS_DRIVER must be 'google' or 'fixture'.");

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && !isProduction() && !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return { driver: "google", ...readKeyFile(keyFile) };
  }
  const env = read(
    z.object({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email(),
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().includes("PRIVATE KEY"),
    }),
    process.env,
    "Google service account",
  );
  return {
    driver: "google",
    clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: normalizePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
  };
}

/** Service-account email shown to faculty in sharing instructions (safe to display). */
export function getServiceAccountEmail(): string | null {
  try {
    return getSheetsConfig().clientEmail;
  } catch {
    return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null;
  }
}

/** Env UIs often store the PEM with literal "\n" sequences; restore real newlines. */
export function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, "\n").trim() + "\n";
}

function readKeyFile(path: string): { clientEmail: string; privateKey: string } {
  // Local development convenience only; never used when NODE_ENV=production.
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ConfigError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE could not be read as JSON.");
  }
  const parsed = z.object({ client_email: z.string().email(), private_key: z.string() }).safeParse(json);
  if (!parsed.success) throw new ConfigError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not a service-account key file.");
  return { clientEmail: parsed.data.client_email, privateKey: normalizePrivateKey(parsed.data.private_key) };
}

export function getCronSecret(): string | null {
  const value = process.env.CRON_SECRET;
  return value && value.length >= 16 ? value : null;
}

export function getSyncSettings(): { staleAfterMinutes: number; batchSize: number; intervalMinutes: number } {
  const stale = Number(process.env.SYNC_STALE_AFTER_MINUTES ?? 60);
  const batch = Number(process.env.SYNC_BATCH_SIZE ?? 10);
  const interval = Number(process.env.SYNC_INTERVAL_MINUTES ?? 15);
  return {
    staleAfterMinutes: Number.isFinite(stale) && stale > 0 ? stale : 60,
    batchSize: Number.isInteger(batch) && batch > 0 && batch <= 50 ? batch : 10,
    // How often each course is synced automatically (scheduler and faculty page visits). Min 5.
    intervalMinutes: Number.isFinite(interval) && interval >= 5 ? interval : 15,
  };
}

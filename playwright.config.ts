import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://syncscore:syncscore_local_only@localhost:54329/syncscore_e2e";
export const E2E_FIXTURE_FILE = "e2e/.runtime/sheets.json";

process.env.E2E_DATABASE_URL = E2E_DATABASE_URL;

/**
 * End-to-end tests run a dedicated dev server (port 3100, build dir .next-e2e) against the
 * isolated `syncscore_e2e` database and a fixture spreadsheet file that tests can modify.
 * Sign-in is simulated by inserting Auth.js session rows (see e2e/support/db.ts).
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /student\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_URL: E2E_DATABASE_URL,
      // The local test database has no TLS; don't inherit a Supabase CA from .env.
      DATABASE_CA_CERT: "",
      AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
      AUTH_GOOGLE_ID: "e2e-not-a-real-client",
      AUTH_GOOGLE_SECRET: "e2e-not-a-real-secret",
      AUTH_URL: `http://localhost:${PORT}`,
      AUTH_TRUST_HOST: "true",
      APP_URL: `http://localhost:${PORT}`,
      STUDENT_EMAIL_DOMAINS: "g.bracu.ac.bd",
      FACULTY_EMAIL_DOMAINS: "bracu.ac.bd",
      SHEETS_DRIVER: "fixture",
      SHEETS_FIXTURE_FILE: E2E_FIXTURE_FILE,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "syncscore-e2e@example-project.iam.gserviceaccount.com",
      CRON_SECRET: "e2e-cron-secret-0123456789abcdef",
      LOG_LEVEL: "warn",
    },
  },
});

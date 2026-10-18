import { execSync } from "node:child_process";
import { applyTestEnv, TEST_DATABASE_URL } from "./test-env";

/**
 * Brings the isolated test database up to the latest migration (non-destructive). Each test
 * file truncates tables itself (tests/support/factories.ts → resetDatabase), and only ever
 * against a database whose name ends in `_test`.
 */
export default function setup() {
  applyTestEnv();
  execSync("pnpm -s prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}

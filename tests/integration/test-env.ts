/** Environment for integration tests. Points at the isolated `syncscore_test` database. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://syncscore:syncscore_local_only@localhost:54329/syncscore_test";

export function applyTestEnv() {
  if (!/_test(\?|$)/.test(new URL(TEST_DATABASE_URL).pathname + "")) {
    throw new Error("Refusing to run integration tests against a database whose name doesn't end in _test.");
  }
  Object.assign(process.env, {
    DATABASE_URL: TEST_DATABASE_URL,
    DIRECT_URL: TEST_DATABASE_URL,
    STUDENT_EMAIL_DOMAINS: "g.bracu.ac.bd",
    FACULTY_EMAIL_DOMAINS: "bracu.ac.bd",
    SHEETS_DRIVER: "fixture",
    SHEETS_FIXTURE_FILE: "/nonexistent-tests-inject-a-client.json",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "syncscore-test@example.iam.gserviceaccount.com",
    LOG_SILENT: "1",
    DATABASE_POOL_MAX: "4",
  });
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError, getDomainPolicyConfig, getSheetsConfig, normalizePrivateKey } from "@/server/env";

afterEach(() => vi.unstubAllEnvs());

describe("environment validation", () => {
  it("refuses the fixture Sheets driver in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHEETS_DRIVER", "fixture");
    vi.stubEnv("SHEETS_FIXTURE_FILE", "x.json");
    expect(() => getSheetsConfig()).toThrow(ConfigError);
  });

  it("names missing variables without echoing secret values", () => {
    vi.stubEnv("SHEETS_DRIVER", "google");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "sa@p.iam.gserviceaccount.com");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "not-a-key-super-secret-value");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY_FILE", "");
    try {
      getSheetsConfig();
      throw new Error("expected failure");
    } catch (err) {
      expect((err as Error).message).toContain("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
      expect((err as Error).message).not.toContain("super-secret");
    }
  });

  it("restores escaped newlines in private keys", () => {
    expect(normalizePrivateKey("-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----")).toBe("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n");
  });

  it("parses domain lists and rejects malformed ones", () => {
    vi.stubEnv("STUDENT_EMAIL_DOMAINS", " @G.bracu.ac.bd , ");
    vi.stubEnv("FACULTY_EMAIL_DOMAINS", "bracu.ac.bd");
    expect(getDomainPolicyConfig()).toEqual({ studentDomains: ["g.bracu.ac.bd"], facultyDomains: ["bracu.ac.bd"] });
    vi.stubEnv("FACULTY_EMAIL_DOMAINS", "not a domain");
    expect(() => getDomainPolicyConfig()).toThrow(ConfigError);
  });
});

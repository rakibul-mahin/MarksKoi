import { describe, expect, it } from "vitest";
import { buildPoolConfig } from "@/server/db-config";

describe("buildPoolConfig", () => {
  it("passes the URL through unchanged without a CA (local docker)", () => {
    expect(buildPoolConfig("postgresql://u:p@localhost:54329/db", undefined)).toEqual({ connectionString: "postgresql://u:p@localhost:54329/db" });
  });

  it("verifies against the provided CA and strips URL ssl params that would override it", () => {
    const cfg = buildPoolConfig("postgresql://u:p%40x@h.pooler.supabase.com:6543/postgres?sslmode=require&application_name=s", "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----");
    expect(cfg.ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----\n", rejectUnauthorized: true });
    expect(cfg.connectionString).not.toContain("sslmode");
    expect(cfg.connectionString).toContain("application_name=s");
    expect(cfg.connectionString).toContain("u:p%40x@");
  });
});

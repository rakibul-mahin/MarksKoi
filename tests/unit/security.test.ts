import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";
import { clampPage } from "@/server/validation";
import { A, arg } from "@/server/actions/args";

describe("buildCsp", () => {
  it("only lets nonce-carrying scripts run in production", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
  it("allows dev tooling only in development", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
    expect(buildCsp("n", true)).toContain("connect-src 'self' ws: wss:");
  });
});

describe("clampPage", () => {
  it("turns untrusted page numbers into a safe whole page", () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage("abc")).toBe(1);
    expect(clampPage(-3)).toBe(1);
    expect(clampPage(0)).toBe(1);
    expect(clampPage("2.7")).toBe(2);
    expect(clampPage(Infinity)).toBe(1);
    expect(clampPage("1e9")).toBe(10_000);
    expect(clampPage(4)).toBe(4);
  });
});

describe("server action argument checks", () => {
  it("rejects values of the wrong runtime type", () => {
    expect(arg(A.bool, false)).toBe(false);
    expect(() => arg(A.bool, "false")).toThrow(/malformed/);
    expect(() => arg(A.role, "SUPERUSER")).toThrow(/malformed/);
    expect(() => arg(A.id, { $ne: null })).toThrow(/malformed/);
    expect(() => arg(A.id, "x".repeat(65))).toThrow(/malformed/);
    expect(() => arg(A.ids, Array.from({ length: 501 }, () => "a"))).toThrow(/malformed/);
    expect(arg(A.facultyRole, "OWNER")).toBe("OWNER");
  });
});

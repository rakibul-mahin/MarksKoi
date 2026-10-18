import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";
import { withClient } from "./support/db";

async function offeringId(code: string): Promise<string> {
  return withClient(async (c) => {
    const { rows } = await c.query<{ id: string }>("SELECT o.id FROM course_offerings o JOIN courses c ON c.id = o.course_id WHERE c.code = $1", [code]);
    return rows[0].id;
  });
}

test.describe("authorization and security", () => {
  test("anonymous visitors are sent to sign in, keeping their destination", async ({ page }) => {
    await page.goto("/faculty");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Ffaculty/);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });

  test("students cannot open faculty or admin areas", async ({ context, page }) => {
    await signInAs(context, "ayesha.rahman@g.bracu.ac.bd");
    for (const path of ["/faculty", "/faculty/courses/new", "/admin", "/admin/users"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/unauthorized\?reason=FORBIDDEN/);
      await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
    }
  });

  test("a faculty member cannot open another faculty member's course", async ({ context, page }) => {
    await signInAs(context, "other.faculty@bracu.ac.bd");
    const id = await offeringId("CSE110");
    for (const path of [`/faculty/courses/${id}`, `/faculty/courses/${id}/publish`, `/faculty/courses/${id}/assessments`]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page.getByText("Ayesha")).toHaveCount(0);
      await expect(page.getByText("Course not found")).toBeVisible();
    }
  });

  test("changing the course UUID never exposes another course or student", async ({ context, page }) => {
    await signInAs(context, "outsider@g.bracu.ac.bd");
    for (const id of [await offeringId("CSE110"), "00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      const res = await page.goto(`/courses/${id}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByText("This course isn't available")).toBeVisible();
    }
  });

  test("expired sessions are sent back to sign in", async ({ context, page }) => {
    await signInAs(context, "ayesha.rahman@g.bracu.ac.bd", { expiresInMs: -60_000 });
    await page.goto("/student");
    await expect(page).toHaveURL(/\/login\?.*reason=expired/);
    await expect(page.getByText("Your session ended")).toBeVisible();
  });

  test("the cron endpoint rejects missing or wrong secrets", async ({ request }) => {
    expect((await request.post("/api/cron/sync")).status()).toBe(401);
    expect((await request.post("/api/cron/sync", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  });

  test("only Google sign-in exists — no credentials or demo provider", async ({ request }) => {
    const providers = await (await request.get("/api/auth/providers")).json();
    expect(Object.keys(providers)).toEqual(["google"]);
    const creds = await request.post("/api/auth/callback/credentials", { data: { email: "admin@bracu.ac.bd" }, maxRedirects: 0 });
    expect([302, 400, 404, 500]).toContain(creds.status());
    expect(creds.headers()["set-cookie"] ?? "").not.toContain("session-token");
  });

  test("secrets never appear in client JavaScript", async ({ context, page }) => {
    await signInAs(context, "farhana.islam@bracu.ac.bd");
    const scripts = new Set<string>();
    page.on("response", (r) => {
      if (r.request().resourceType() === "script") scripts.add(r.url());
    });
    for (const p of ["/", "/login", "/faculty", "/faculty/courses"]) await page.goto(p);
    const forbidden = ["e2e-only-secret-not-used-anywhere-else", "e2e-cron-secret", "e2e-not-a-real-secret", "syncscore_local_only", "PRIVATE KEY", "DATABASE_URL"];
    expect(scripts.size).toBeGreaterThan(0);
    for (const url of scripts) {
      const text = await (await page.request.get(url)).text();
      for (const s of forbidden) expect(text, `${s} leaked in ${url}`).not.toContain(s);
    }
  });

  test("security headers are set", async ({ request }) => {
    const res = await request.get("/login");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
    expect(res.headers()["cross-origin-opener-policy"]).toBe("same-origin");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("pages use a fresh script nonce and nothing violates the Content-Security-Policy", async ({ context, page }) => {
    const nonces = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const res = await page.request.get("/login");
      const csp = res.headers()["content-security-policy"] ?? "";
      const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
      expect(nonce).toBeTruthy();
      expect(csp).toContain("'strict-dynamic'");
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      nonces.add(nonce!);
    }
    expect(nonces.size).toBe(2);

    const violations: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) violations.push(m.text());
    });
    await page.goto("/");
    await signInAs(context, "other.faculty@bracu.ac.bd");
    await page.goto("/faculty");
    await expect(page.getByRole("heading").first()).toBeVisible();
    // The theme script ran (it sets a class on <html>), so the nonce reached it.
    await expect(page.locator("html")).toHaveAttribute("class", /light|dark/);
    expect(violations).toEqual([]);
  });

  test("API responses may not load or embed anything", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.headers()["content-security-policy"]).toContain("default-src 'none'");
  });
});

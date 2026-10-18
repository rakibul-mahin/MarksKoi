/**
 * Visual review helper: screenshots pages at desktop and mobile widths, reporting horizontal
 * overflow and console errors. Usage (dev server running, DATABASE_URL set):
 *   npx tsx e2e/support/screenshots.mts <outDir> '[["email-or-null","/path","name"], ...]'
 */
import { chromium } from "@playwright/test";
import { createSessionFor, SESSION_COOKIE } from "./db";

const out = process.argv[2];
const base = "http://localhost:3000";
const plan: Array<[string | null, string, string]> = JSON.parse(process.argv[3]);
const browser = await chromium.launch();
for (const [email, path, name] of plan) {
  for (const [vw, vh, tag] of [[1366, 900, "d"], [390, 844, "m"]] as const) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: name.includes("dark") ? "dark" : "light" });
    if (email) {
      const token = await createSessionFor(email);
      await ctx.addCookies([{ name: SESSION_COOKIE, value: token, url: base }]);
    }
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${name}-${tag}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`${name}-${tag}: ${page.url().replace(base, "")} overflowX=${overflow} errors=${errors.length ? JSON.stringify(errors.slice(0, 3)) : 0}`);
    await ctx.close();
  }
}
await browser.close();

import type { BrowserContext } from "@playwright/test";
import { createSessionFor, SESSION_COOKIE } from "./db";

/** Signs a browser context in as `email` by attaching a real database session cookie. */
export async function signInAs(context: BrowserContext, email: string, opts?: { expiresInMs?: number }) {
  const token = await createSessionFor(email, opts);
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: "http://localhost:3100", httpOnly: true, sameSite: "Lax" }]);
  return token;
}

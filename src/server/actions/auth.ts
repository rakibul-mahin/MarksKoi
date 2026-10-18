"use server";

import { signIn, signOut } from "../auth/config";

/** Only same-origin relative paths are accepted as post-login destinations. */
function safeCallback(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/home";
  return value.slice(0, 500);
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login?signedOut=1" });
}

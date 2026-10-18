import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasRole, type RoleName } from "../authz/permissions";
import { db } from "../db";
import { AppError } from "../errors";
import { auth, SESSION_COOKIE_NAMES } from "./config";
import { loadViewer, type CurrentViewer } from "./viewer";

/** The authenticated viewer for this request (memoized per request), or null. */
export const getCurrentViewer = cache(async (): Promise<CurrentViewer | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return loadViewer(db, id);
});

async function loginRedirect(): Promise<never> {
  const store = await cookies();
  const hadCookie = SESSION_COOKIE_NAMES.some((n) => store.has(n));
  const path = (await headers()).get("x-syncscore-path") ?? "/";
  const params = new URLSearchParams({ callbackUrl: path.startsWith("/") && !path.startsWith("//") ? path : "/" });
  if (hadCookie) params.set("reason", "expired");
  redirect(`/login?${params.toString()}`);
}

/** Pages/layouts: require a signed-in, non-suspended viewer. */
export async function requireViewer(): Promise<CurrentViewer> {
  const viewer = await getCurrentViewer();
  if (!viewer) return loginRedirect();
  if (viewer.suspended) redirect("/unauthorized?reason=SUSPENDED");
  return viewer;
}

/** Pages/layouts: require a role, redirecting to a clear explanation otherwise. */
export async function requireRole(role: RoleName): Promise<CurrentViewer> {
  const viewer = await requireViewer();
  if (!hasRole(viewer, role)) redirect(`/unauthorized?reason=FORBIDDEN&area=${role.toLowerCase()}`);
  return viewer;
}

/** Server actions / route handlers: same checks, but throw instead of redirecting. */
export async function requireActionViewer(role?: RoleName): Promise<CurrentViewer> {
  const viewer = await getCurrentViewer();
  if (!viewer) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  if (viewer.suspended) throw new AppError("FORBIDDEN", "Your account is suspended.");
  if (role && !hasRole(viewer, role)) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  return viewer;
}

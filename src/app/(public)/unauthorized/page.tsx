import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SIGN_IN_DENIAL_MESSAGES } from "@/server/auth/domain-policy";
import { getCurrentViewer } from "@/server/auth/guards";
import { signOutAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Access not available" };

export default async function UnauthorizedPage(props: PageProps<"/unauthorized">) {
  const params = await props.searchParams;
  const reason = typeof params.reason === "string" ? params.reason : "FORBIDDEN";
  const message = SIGN_IN_DENIAL_MESSAGES[reason] ?? SIGN_IN_DENIAL_MESSAGES.FORBIDDEN;
  const viewer = await getCurrentViewer().catch(() => null);
  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-10 sm:pt-20">
      <div className="rounded-2xl bg-card p-8 ring-1 ring-foreground/10">
        <span className="grid size-11 place-items-center rounded-full bg-danger-soft text-destructive">
          <ShieldAlert className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl">
          {reason === "FORBIDDEN" ? "You don't have access to this page" : "We couldn't sign you in"}
        </h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        {viewer && <p className="mt-3 text-sm text-muted-foreground">Signed in as <span className="text-foreground">{viewer.email}</span>.</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          {viewer ? (
            <>
              {reason === "FORBIDDEN" && !viewer.suspended && (
                <Button asChild>
                  <Link href="/home">Go to my dashboard</Link>
                </Button>
              )}
              <form action={signOutAction}>
                <Button type="submit" variant="outline">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <Button asChild>
              <Link href="/login">Back to sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

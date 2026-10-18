import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert, Info } from "lucide-react";
import { getCurrentViewer } from "@/server/auth/guards";
import { signInWithGoogle } from "@/server/actions/auth";
import { GoogleSubmitButton } from "./google-button";

export const metadata: Metadata = { title: "Sign in" };

const AUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That Google account can't be linked to your SyncScore profile. Contact an administrator.",
  AccessDenied: "Access was denied. Use your university Google account.",
  Configuration: "Sign-in isn't configured correctly on this server. Please contact an administrator.",
  Verification: "The sign-in link is no longer valid. Please try again.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/home";
  if (await getCurrentViewer()) redirect("/home");
  const reason = typeof params.reason === "string" ? params.reason : null;
  const error = typeof params.error === "string" ? (AUTH_ERRORS[params.error] ?? "Sign-in didn't complete. Please try again.") : null;

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 pb-16 pt-8 sm:pt-16">
      <div className="ledger-ruling rounded-2xl bg-card p-7 ring-1 ring-foreground/10 sm:p-9">
        <h1 className="font-display text-[1.9rem] leading-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your BRAC University Google account: <span className="tabular text-foreground">@g.bracu.ac.bd</span> for students,{" "}
          <span className="tabular text-foreground">@bracu.ac.bd</span> for faculty.
        </p>

        <div className="mt-6 space-y-3" aria-live="polite">
          {reason === "expired" && (
            <p className="flex gap-2 rounded-lg bg-info-soft px-3.5 py-3 text-sm text-info">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Your session ended. Sign in again to continue where you left off.
            </p>
          )}
          {params.signedOut && (
            <p className="flex gap-2 rounded-lg bg-success-soft px-3.5 py-3 text-sm text-success">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              You&apos;re signed out.
            </p>
          )}
          {error && (
            <p role="alert" className="flex gap-2 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

        <form action={signInWithGoogle} className="mt-6">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <GoogleSubmitButton />
        </form>
        <p className="mt-6 text-xs text-muted-foreground">
          SyncScore only reads your name, email address and profile photo from Google. It never accesses your Drive, Gmail or other data.
        </p>
      </div>
    </div>
  );
}

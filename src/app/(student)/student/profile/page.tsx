import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guards";
import { PageHeader } from "@/components/kit/page-header";
import { signOutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const viewer = await requireRole("STUDENT");
  const rows: Array<[string, React.ReactNode]> = [
    ["Name", viewer.name ?? "—"],
    ["University email", <span key="e" className="tabular">{viewer.email}</span>],
    ["Student ID", viewer.studentId ? <span key="i" className="tabular">{viewer.studentId}</span> : "Not on file yet. It's added when an instructor's class list includes it."],
  ];
  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" description="This is how your instructors' class lists are matched to your account." />
      <dl className="divide-y divide-rule rounded-xl bg-card ring-1 ring-foreground/10">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[11rem_1fr]">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="text-sm">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">
        If your name or student ID is wrong, ask your instructor to correct it in their spreadsheet. Your email comes from your university Google account.
      </p>
      <form action={signOutAction} className="mt-8">
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}

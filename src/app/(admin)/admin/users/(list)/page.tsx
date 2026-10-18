import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { searchUsers } from "@/server/services/admin";
import { PageHeader } from "@/components/kit/page-header";
import { SearchForm } from "@/components/kit/search-form";
import { Pagination } from "@/components/kit/pagination";
import { RelativeTime } from "@/components/kit/relative-time";
import { StatusPill } from "@/components/kit/status";

export const metadata: Metadata = { title: "Users & roles" };

export default async function UsersPage(props: PageProps<"/admin/users">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const viewer = await requireRole("ADMIN");
  const { users, total, pageSize } = await searchUsers(viewer, q, page);
  return (
    <div className="space-y-6">
      <PageHeader title="Users & roles" description="Look up anyone by email, name or student ID to review their access." />
      <SearchForm defaultValue={q} placeholder="Email, name or student ID" label="Search users" />
      <div className="relative overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-rule text-xs text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">Person</th>
              <th scope="col" className="px-5 py-3 font-medium">Roles</th>
              <th scope="col" className="px-5 py-3 font-medium">Status</th>
              <th scope="col" className="px-5 py-3 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-rule last:border-0 hover:bg-muted/50">
                <td className="px-5 py-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:text-primary hover:underline">
                    {u.name ?? u.email}
                  </Link>
                  <span className="tabular block text-xs text-muted-foreground">
                    {u.email}
                    {u.studentId && ` · ${u.studentId}`}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className="flex flex-wrap gap-1">
                    {u.roles.length ? u.roles.map((r) => <StatusPill key={r.role} tone={r.role === "ADMIN" ? "warning" : r.role === "FACULTY" ? "info" : "neutral"}>{r.role.toLowerCase()}</StatusPill>) : <span className="text-muted-foreground">none</span>}
                  </span>
                </td>
                <td className="px-5 py-3">{u.status === "SUSPENDED" ? <StatusPill tone="danger">Suspended</StatusPill> : u.claimedAt ? "Active" : <span className="text-muted-foreground">Not signed in yet</span>}</td>
                <td className="px-5 py-3 text-muted-foreground">{u.lastSignInAt ? <RelativeTime date={u.lastSignInAt} /> : "—"}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                  No one matches “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => `/admin/users?${new URLSearchParams({ q, page: String(p) })}`} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { AppError } from "@/server/errors";
import { adminUserDetail } from "@/server/request-cache";
import { semesterLabel } from "@/lib/academic";
import { PageHeader, SectionHeading } from "@/components/kit/page-header";
import { formatDateTime, RelativeTime } from "@/components/kit/relative-time";
import { StatusPill } from "@/components/kit/status";
import { UserAdminControls } from "./user-admin-controls";

export const metadata: Metadata = { title: "User details" };

export default async function UserDetailPage(props: PageProps<"/admin/users/[profileId]">) {
  const { profileId } = await props.params;
  const viewer = await requireRole("ADMIN");
  let user;
  try {
    user = await adminUserDetail(viewer, profileId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const activeRoles = new Set(user.roles.filter((r) => !r.revokedAt).map((r) => r.role));
  return (
    <div className="space-y-8">
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Users
      </Link>
      <PageHeader
        title={user.name ?? user.email}
        description={
          <span className="tabular">
            {user.email}
            {user.studentId && ` · ID ${user.studentId}`}
          </span>
        }
        actions={user.status === "SUSPENDED" ? <StatusPill tone="danger">Suspended</StatusPill> : null}
      />
      <dl className="grid grid-cols-1 gap-4 rounded-xl bg-card p-5 text-sm ring-1 ring-foreground/10 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">First sign-in</dt>
          <dd>{user.claimedAt ? formatDateTime(user.claimedAt) : "Never (added from a class list)"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last sign-in</dt>
          <dd>{user.lastSignInAt ? <RelativeTime date={user.lastSignInAt} /> : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Google account</dt>
          <dd>{user.accounts.length ? "Linked" : "Not linked"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Active sessions</dt>
          <dd className="tabular">{user._count.sessions}</dd>
        </div>
      </dl>

      <section aria-labelledby="access-heading">
        <SectionHeading title={<span id="access-heading">Access</span>} description="Changes take effect on the person's next page load. All changes are recorded in the audit log." />
        <UserAdminControls profileId={user.id} isSelf={user.id === viewer.profileId} roles={[...activeRoles]} suspended={user.status === "SUSPENDED"} hasGoogle={user.accounts.length > 0} />
        {user.roles.some((r) => r.revokedAt) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Revoked:{" "}
            {user.roles
              .filter((r) => r.revokedAt)
              .map((r) => `${r.role.toLowerCase()} (by ${r.revokedBy?.email ?? "system"}, ${formatDateTime(r.revokedAt!)})`)
              .join("; ")}
            . Automatic sign-in provisioning will not re-grant these.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="teaching-heading">
          <SectionHeading title={<span id="teaching-heading">Teaching</span>} />
          {user.facultyAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No course assignments.</p>
          ) : (
            <ul className="divide-y divide-rule rounded-xl bg-card text-sm ring-1 ring-foreground/10">
              {user.facultyAssignments.map((f) => (
                <li key={f.offering.id} className="flex justify-between gap-3 px-5 py-3">
                  <span>
                    {f.offering.course.code}-{f.offering.section} <span className="text-muted-foreground">· {semesterLabel(f.offering.semester.season, f.offering.semester.year)}</span>
                  </span>
                  <span className="text-muted-foreground">{f.role === "OWNER" ? "Owner" : "Co-instructor"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="enrolled-heading">
          <SectionHeading title={<span id="enrolled-heading">Enrolled in</span>} description="Course membership only. Marks are not shown here." />
          {user.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrollments.</p>
          ) : (
            <ul className="divide-y divide-rule rounded-xl bg-card text-sm ring-1 ring-foreground/10">
              {user.enrollments.map((e) => (
                <li key={e.offering.id} className="flex justify-between gap-3 px-5 py-3">
                  <span>
                    {e.offering.course.code}-{e.offering.section} <span className="text-muted-foreground">· {semesterLabel(e.offering.semester.season, e.offering.semester.year)}</span>
                  </span>
                  <span className="text-muted-foreground">{e.status === "ACTIVE" ? "Enrolled" : "Removed from class list"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

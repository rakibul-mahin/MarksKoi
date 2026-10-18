import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listAllOfferings } from "@/server/services/admin";
import { semesterLabel } from "@/lib/academic";
import { PageHeader } from "@/components/kit/page-header";
import { SearchForm } from "@/components/kit/search-form";
import { Pagination } from "@/components/kit/pagination";
import { PublicationBadge, StatusPill, SyncStatusBadge } from "@/components/kit/status";
import { FacultyAssignment } from "./faculty-assignment";

export const metadata: Metadata = { title: "Courses" };

export default async function AdminCourses(props: PageProps<"/admin/courses">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const open = typeof sp.open === "string" ? sp.open : null;
  const viewer = await requireRole("ADMIN");
  const { offerings, total, pageSize } = await listAllOfferings(viewer, q, page);
  const href = (extra: Record<string, string>) => `/admin/courses?${new URLSearchParams({ q, page: String(page), ...extra })}`;
  return (
    <div className="space-y-6">
      <PageHeader title="Courses" description="Every course section on the platform, with its instructors and sync state." />
      <SearchForm defaultValue={q} placeholder="Course code or title" label="Search courses" />
      <ul className="space-y-3">
        {offerings.map((o) => (
          <li key={o.id} className="rounded-xl bg-card ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className="min-w-0 flex-1">
                <span className="font-display text-lg">{o.course.code}</span>{" "}
                <span className="text-sm text-muted-foreground">
                  Sec {o.section} · {semesterLabel(o.semester.season, o.semester.year)} · {o.title} · {o._count.enrollments} students
                </span>
                <span className="block text-xs text-muted-foreground">
                  {o.faculty.map((f) => `${f.profile.name ?? f.profile.email}${f.role === "OWNER" ? " (owner)" : ""}`).join(", ") || "No instructors assigned"}
                </span>
              </span>
              {o.status === "ARCHIVED" && <StatusPill tone="neutral">Archived</StatusPill>}
              <SyncStatusBadge status={o.lastSyncStatus} />
              <PublicationBadge status={o.publicationStatus} />
              <Link href={open === o.id ? href({}) : href({ open: o.id })} scroll={false} className="text-sm font-medium text-primary hover:underline" aria-expanded={open === o.id}>
                {open === o.id ? "Close" : "Manage instructors"}
              </Link>
            </div>
            {open === o.id && (
              <div className="border-t border-rule px-5 py-4">
                <FacultyAssignment offeringId={o.id} members={o.faculty.map((f) => ({ profileId: f.profile.id, label: f.profile.name ?? f.profile.email, email: f.profile.email, role: f.role }))} />
              </div>
            )}
          </li>
        ))}
        {offerings.length === 0 && <li className="rounded-xl bg-card px-5 py-10 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">No courses found.</li>}
      </ul>
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => `/admin/courses?${new URLSearchParams({ q, page: String(p) })}`} />
    </div>
  );
}

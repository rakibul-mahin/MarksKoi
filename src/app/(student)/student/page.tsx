import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpenCheck, Clock } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { listStudentCourses, type StudentCourseSummary } from "@/server/services/student";
import { EmptyState } from "@/components/kit/empty-state";
import { RevealItem, RevealList } from "@/components/kit/reveal";
import { RelativeTime } from "@/components/kit/relative-time";
import { firstNameOf } from "@/lib/names";

export const metadata: Metadata = { title: "My courses" };

export default async function StudentDashboard() {
  const viewer = await requireRole("STUDENT");
  const courses = await listStudentCourses(viewer);
  const firstName = firstNameOf(viewer.name);
  const bySemester = new Map<string, StudentCourseSummary[]>();
  for (const c of courses) bySemester.set(c.semester, [...(bySemester.get(c.semester) ?? []), c]);

  return (
    <div className="space-y-10">
      <header className="space-y-1.5">
        <h1 className="font-display text-[2rem] leading-tight tracking-tight">{firstName ? `Hello, ${firstName}` : "Your courses"}</h1>
        <p className="text-muted-foreground">
          {courses.length === 0
            ? "Your courses will show up here."
            : `${courses.length} ${courses.length === 1 ? "course" : "courses"} · ${courses.filter((c) => c.publishedAt).length} with published results`}
        </p>
      </header>

      {courses.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="No courses yet">
          A course appears here once your instructor connects their class list to SyncScore and it includes <span className="tabular text-foreground">{viewer.email}</span>. If a course is missing after the first week, ask your instructor to check that your email is in their sheet.
        </EmptyState>
      ) : (
        [...bySemester.entries()].map(([semester, list], i) => (
          <section key={semester} aria-labelledby={`sem-${i}`}>
            <h2 id={`sem-${i}`} className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {semester}
            </h2>
            <RevealList as="ul" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {list.map((c) => (
                <RevealItem as="li" key={c.offeringId}>
                  <CourseCard course={c} />
                </RevealItem>
              ))}
            </RevealList>
          </section>
        ))
      )}
    </div>
  );
}

function CourseCard({ course }: { course: StudentCourseSummary }) {
  return (
    <Link
      href={`/courses/${course.offeringId}`}
      className="group relative flex h-full flex-col rounded-xl bg-card p-5 ring-1 ring-foreground/10 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(21,94,75,0.5)] hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none tracking-tight">{course.code}</p>
          <p className="mt-1.5 truncate text-[0.95rem]">{course.title}</p>
        </div>
        <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" aria-hidden="true" />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Section {course.section}
        {course.instructors.length > 0 && ` · ${course.instructors.join(", ")}`}
      </p>
      <div className="mt-auto pt-5 text-sm">
        {course.publishedAt ? (
          <p className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            <span>
              {course.publishedCount} {course.publishedCount === 1 ? "assessment" : "assessments"} published{" "}
              <RelativeTime date={course.publishedAt} className="text-muted-foreground" />
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-4" aria-hidden="true" />
            No results published yet
          </p>
        )}
        {course.archived && <p className="mt-1 text-xs text-muted-foreground">This course is archived. Your results are still available.</p>}
      </div>
    </Link>
  );
}

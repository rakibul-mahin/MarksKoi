import type { Metadata } from "next";
import Link from "next/link";
import { BookPlus, FileSpreadsheet } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { listFacultyOfferings } from "@/server/services/offerings";
import { semesterLabel } from "@/lib/academic";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { CourseTable, type CourseRow } from "./course-table";

export const metadata: Metadata = { title: "Courses" };

export default async function FacultyCourses() {
  const viewer = await requireRole("FACULTY");
  const offerings = await listFacultyOfferings(viewer);
  const rows: CourseRow[] = offerings.map((o) => ({
    id: o.id,
    code: o.code,
    title: o.title,
    section: o.section,
    semester: semesterLabel(o.season, o.year),
    semesterKey: o.year * 10 + ["SPRING", "SUMMER", "FALL"].indexOf(o.season),
    status: o.status,
    publicationStatus: o.publicationStatus,
    health: o.health,
    studentCount: o.studentCount,
    lastSyncSuccessAt: o.lastSyncSuccessAt?.toISOString() ?? null,
    myRole: o.myRole,
  }));
  return (
    <div>
      <PageHeader
        title="Courses"
        description="Every course section you teach or co-teach."
        actions={
          <Button asChild>
            <Link href="/faculty/courses/new">
              <BookPlus aria-hidden="true" />
              New course
            </Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No courses yet" action={<Button asChild><Link href="/faculty/courses/new">Create a course</Link></Button>}>
          Create a course for each section you teach. If a colleague already created it, ask them to add you as a co-instructor.
        </EmptyState>
      ) : (
        <CourseTable rows={rows} />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { AppError } from "@/server/errors";
import { studentCourseResults } from "@/server/request-cache";
import { CourseResults } from "@/components/results/course-results";

export const metadata: Metadata = { title: "Course results" };

export default async function CourseResultsPage(props: PageProps<"/courses/[offeringId]">) {
  const { offeringId } = await props.params;
  const viewer = await requireRole("STUDENT");
  let view;
  try {
    view = await studentCourseResults(viewer, offeringId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  return (
    <div className="space-y-6">
      <Link href="/student" className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All courses
      </Link>
      <CourseResults view={view} />
    </div>
  );
}

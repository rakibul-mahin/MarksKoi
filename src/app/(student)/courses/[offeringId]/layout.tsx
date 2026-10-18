import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { AppError } from "@/server/errors";
import { studentCourseResults } from "@/server/request-cache";

/** Authorization runs here, outside the loading boundary, so denied requests get a real 404. */
export default async function CourseAccessLayout(props: LayoutProps<"/courses/[offeringId]">) {
  const { offeringId } = await props.params;
  const viewer = await requireRole("STUDENT");
  try {
    await studentCourseResults(viewer, offeringId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  return props.children;
}

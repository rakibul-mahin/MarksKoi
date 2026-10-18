import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guards";
import { currentSemester } from "@/lib/academic";
import { PageHeader } from "@/components/kit/page-header";
import { NewCourseForm } from "./new-course-form";

export const metadata: Metadata = { title: "New course" };

export default async function NewCoursePage() {
  await requireRole("FACULTY");
  const sem = currentSemester();
  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="New course"
        title="Create a course section"
        description="One course per section you teach. You'll connect your marks spreadsheet on the next screen."
      />
      <ol className="mb-8 grid gap-2 text-sm sm:grid-cols-4" aria-label="Setup steps">
        {["Course details", "Connect spreadsheet", "Choose columns", "Sync & publish"].map((step, i) => (
          <li key={step} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${i === 0 ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`} aria-current={i === 0 ? "step" : undefined}>
            <span className={`tabular grid size-6 place-items-center rounded-full text-xs ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <NewCourseForm defaultSeason={sem.season} defaultYear={sem.year} />
    </div>
  );
}

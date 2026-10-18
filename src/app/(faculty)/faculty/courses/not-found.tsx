import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Button } from "@/components/ui/button";

export default function FacultyCourseNotFound() {
  return (
    <EmptyState icon={SearchX} title="Course not found" action={<Button asChild><Link href="/faculty/courses">See my courses</Link></Button>}>
      It may not exist, or you aren&apos;t one of its instructors. Ask the course owner to add you as a co-instructor.
    </EmptyState>
  );
}

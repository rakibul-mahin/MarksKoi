import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Button } from "@/components/ui/button";

export default function CourseNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="This course isn't available"
      action={
        <Button asChild>
          <Link href="/student">See my courses</Link>
        </Button>
      }
    >
      It may not exist, or you aren&apos;t enrolled in it. Courses appear once your instructor&apos;s class list includes you.
    </EmptyState>
  );
}

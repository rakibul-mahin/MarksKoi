import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Button } from "@/components/ui/button";

export default function UserNotFound() {
  return (
    <EmptyState icon={SearchX} title="User not found" action={<Button asChild><Link href="/admin/users">Back to users</Link></Button>}>
      No account matches that link.
    </EmptyState>
  );
}

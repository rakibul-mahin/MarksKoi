import { TopBarShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/guards";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole("STUDENT");
  return <TopBarShell viewer={viewer}>{children}</TopBarShell>;
}

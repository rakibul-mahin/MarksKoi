import { SidebarShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/guards";

export default async function FacultyLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole("FACULTY");
  return (
    <SidebarShell area="faculty" viewer={viewer}>
      {children}
    </SidebarShell>
  );
}

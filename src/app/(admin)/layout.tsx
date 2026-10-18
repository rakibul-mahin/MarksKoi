import { SidebarShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole("ADMIN");
  return (
    <SidebarShell area="admin" viewer={viewer}>
      {children}
    </SidebarShell>
  );
}

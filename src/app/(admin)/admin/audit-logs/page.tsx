import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guards";
import { searchAuditLogs } from "@/server/services/admin";
import { describeAuditAction } from "@/components/kit/audit-text";
import { PageHeader } from "@/components/kit/page-header";
import { Pagination } from "@/components/kit/pagination";
import { formatDateTime } from "@/components/kit/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Audit log" };

const AREAS = [
  ["", "All actions"],
  ["publication", "Publication"],
  ["sync", "Sync"],
  ["mapping", "Column mapping"],
  ["source", "Spreadsheet"],
  ["offering", "Courses"],
  ["role", "Roles"],
  ["profile", "Accounts"],
  ["sessions", "Sessions"],
  ["admin", "Administrator access"],
  ["auth", "Sign-in"],
] as const;

export default async function AuditLogPage(props: PageProps<"/admin/audit-logs">) {
  const sp = await props.searchParams;
  const action = typeof sp.action === "string" ? sp.action : "";
  const actor = typeof sp.actor === "string" ? sp.actor : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const viewer = await requireRole("ADMIN");
  const { logs, total, pageSize } = await searchAuditLogs(viewer, { action, actor, page });
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Who did what, and when. Entries can't be edited or deleted from the app." />
      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" role="search">
        <select name="action" defaultValue={action} aria-label="Filter by area" className="h-9 rounded-lg border border-input bg-card px-3 text-sm">
          {AREAS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <Input name="actor" defaultValue={actor} placeholder="Person's email" aria-label="Filter by person" className="h-9 sm:max-w-xs" />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <div className="relative overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead>
            <tr className="border-b border-rule text-xs text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">When</th>
              <th scope="col" className="px-5 py-3 font-medium">Who</th>
              <th scope="col" className="px-5 py-3 font-medium">What</th>
              <th scope="col" className="px-5 py-3 font-medium">Course</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-rule align-top last:border-0">
                <td className="tabular whitespace-nowrap px-5 py-3 text-xs">{formatDateTime(l.createdAt)}</td>
                <td className="px-5 py-3">{l.actor?.email ?? <span className="text-muted-foreground">SyncScore</span>}</td>
                <td className="px-5 py-3">
                  {describeAuditAction(l.action)}
                  <span className="tabular block text-xs text-muted-foreground">{l.action}</span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{l.offering ? `${l.offering.course.code}-${l.offering.section}` : "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No entries match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => `/admin/audit-logs?${new URLSearchParams({ action, actor, page: String(p) })}`} />
    </div>
  );
}

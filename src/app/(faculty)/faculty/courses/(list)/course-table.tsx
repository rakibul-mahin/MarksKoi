"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDownUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HealthBadge, PublicationBadge } from "@/components/kit/status";

export type CourseRow = {
  id: string;
  code: string;
  title: string;
  section: string;
  semester: string;
  semesterKey: number;
  status: "ACTIVE" | "ARCHIVED";
  publicationStatus: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
  health: "ok" | "needs_setup" | "attention" | "stale";
  studentCount: number;
  lastSyncSuccessAt: string | null;
  myRole: "OWNER" | "INSTRUCTOR";
};

const columns: ColumnDef<CourseRow>[] = [
  {
    id: "course",
    header: "Course",
    accessorFn: (r) => `${r.code} ${r.title} ${r.section}`,
    sortingFn: (a, b) => a.original.code.localeCompare(b.original.code) || a.original.section.localeCompare(b.original.section),
    cell: ({ row: { original: r } }) => (
      <Link href={`/faculty/courses/${r.id}`} className="group block rounded-sm">
        <span className="flex items-baseline gap-2">
          <span className="font-display text-base group-hover:text-primary">{r.code}</span>
          <span className="text-xs text-muted-foreground">Sec {r.section}</span>
          {r.myRole === "INSTRUCTOR" && <span className="text-xs text-muted-foreground">· co-instructor</span>}
        </span>
        <span className="block max-w-[22rem] truncate text-sm text-muted-foreground">{r.title}</span>
      </Link>
    ),
  },
  { id: "semester", header: "Semester", accessorKey: "semesterKey", cell: ({ row }) => <span className="whitespace-nowrap text-sm">{row.original.semester}</span> },
  { id: "students", header: "Students", accessorKey: "studentCount", cell: ({ getValue }) => <span className="tabular text-sm">{getValue<number>()}</span> },
  { id: "health", header: "Sync", accessorKey: "health", enableSorting: false, cell: ({ row }) => (row.original.status === "ARCHIVED" ? <span className="text-sm text-muted-foreground">Archived</span> : <HealthBadge health={row.original.health} />) },
  { id: "publication", header: "Results", accessorKey: "publicationStatus", enableSorting: false, cell: ({ getValue }) => <PublicationBadge status={getValue<string>()} /> },
];

export function CourseTable({ rows }: { rows: CourseRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED" | "ALL">("ACTIVE");
  const [sorting, setSorting] = useState<SortingState>([{ id: "semester", desc: true }]);
  const data = useMemo(() => (status === "ALL" ? rows : rows.filter((r) => r.status === status)), [rows, status]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: query },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by code or title" aria-label="Search courses" className="h-9 pl-9" />
        </div>
        <ToggleGroup type="single" variant="outline" value={status} onValueChange={(v) => v && setStatus(v as typeof status)} aria-label="Filter by status">
          <ToggleGroupItem value="ACTIVE">Active</ToggleGroupItem>
          <ToggleGroupItem value="ARCHIVED">Archived</ToggleGroupItem>
          <ToggleGroupItem value="ALL">All</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="relative overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[42rem] text-left">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-rule">
                {hg.headers.map((h) => (
                  <th key={h.id} scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground" aria-sort={h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : undefined}>
                    {h.column.getCanSort() ? (
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 rounded hover:text-foreground">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowDownUp className="size-3" aria-hidden="true" />
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-b border-rule last:border-0 hover:bg-muted/50" onClick={(e) => {
                if ((e.target as HTMLElement).closest("a,button")) return;
                router.push(`/faculty/courses/${row.original.id}`);
              }}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-5 py-3.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No courses match. Try a different search or filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

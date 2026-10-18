"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function CourseTabs({ offeringId }: { offeringId: string }) {
  const pathname = usePathname();
  const base = `/faculty/courses/${offeringId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/assessments`, label: "Spreadsheet & columns" },
    { href: `${base}/sync`, label: "Sync history" },
    { href: `${base}/publish`, label: "Publish & preview" },
    { href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <nav aria-label="Course sections" className="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
          return (
            <li key={t.href} className="relative">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("inline-flex h-11 items-center px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground", active && "text-foreground")}
              >
                {t.label}
              </Link>
              {active && <motion.span layoutId="course-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

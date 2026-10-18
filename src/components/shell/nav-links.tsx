"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BookOpen, Home, Layers, Plus, ScrollText, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

const ICONS = { home: Home, book: BookOpen, plus: Plus, user: User, users: Users, activity: Activity, scroll: ScrollText, layers: Layers };

export function isActive(pathname: string, item: NavItem, all: NavItem[]) {
  if (item.exact) return pathname === item.href;
  if (!(pathname === item.href || pathname.startsWith(item.href + "/"))) return false;
  // Prefer the most specific matching item (e.g. "New course" over "Courses").
  return !all.some((o) => o !== item && o.href.length > item.href.length && (o.exact ? pathname === o.href : pathname.startsWith(o.href)));
}

export function SidebarLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item, items);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                active && "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TopLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item, items) || (item.href === "/student" && pathname.startsWith("/courses/"));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                active && "text-foreground underline decoration-highlight decoration-[6px] underline-offset-[-1px] [text-decoration-skip-ink:none]",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

import Link from "next/link";
import { hasRole } from "@/server/authz/permissions";
import type { CurrentViewer } from "@/server/auth/viewer";
import { Logo } from "@/components/brand/logo";
import { MobileNav } from "./mobile-nav";
import { SidebarLinks, TopLinks } from "./nav-links";
import { AREA_HOME, AREA_LABEL, NAV, type NavArea } from "./nav";
import { UserMenu } from "./user-menu";

function areasFor(viewer: CurrentViewer): NavArea[] {
  const areas: NavArea[] = [];
  if (hasRole(viewer, "STUDENT")) areas.push("student");
  if (hasRole(viewer, "FACULTY")) areas.push("faculty");
  if (hasRole(viewer, "ADMIN")) areas.push("admin");
  return areas;
}

/** Faculty and admin: persistent sidebar on desktop, sheet navigation on mobile. */
export function SidebarShell({ area, viewer, children }: { area: Exclude<NavArea, "student">; viewer: CurrentViewer; children: React.ReactNode }) {
  const items = NAV[area];
  const areas = areasFor(viewer);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="px-5 pb-4 pt-5">
          <Link href={AREA_HOME[area]} className="rounded-md" aria-label="MarksKoi? home">
            <Logo />
          </Link>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{AREA_LABEL[area]}</p>
        </div>
        <nav aria-label={`${AREA_LABEL[area]} navigation`} className="flex-1 overflow-y-auto px-3">
          <SidebarLinks items={items} />
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            <UserMenu name={viewer.name} email={viewer.email} image={viewer.image} areas={areas} current={area} />
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium">{viewer.name ?? viewer.email}</p>
              <p className="truncate text-muted-foreground">{viewer.email}</p>
            </div>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-1">
            <MobileNav items={items} areaLabel={AREA_LABEL[area]} />
            <Link href={AREA_HOME[area]} aria-label="MarksKoi? home">
              <Logo />
            </Link>
          </div>
          <UserMenu name={viewer.name} email={viewer.email} image={viewer.image} areas={areas} current={area} />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Students: a light top bar. Two destinations don't need a sidebar. */
export function TopBarShell({ viewer, children }: { viewer: CurrentViewer; children: React.ReactNode }) {
  const areas = areasFor(viewer);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/student" aria-label="MarksKoi? home" className="rounded-md">
            <Logo />
          </Link>
          <nav aria-label="Student navigation" className="hidden sm:block">
            <TopLinks items={NAV.student} />
          </nav>
          <UserMenu name={viewer.name} email={viewer.email} image={viewer.image} areas={areas} current="student" />
        </div>
        <nav aria-label="Student navigation" className="border-t px-2 sm:hidden">
          <TopLinks items={NAV.student} />
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        Marks come from your instructors&apos; gradebooks and appear here only after they publish them.
      </footer>
    </div>
  );
}

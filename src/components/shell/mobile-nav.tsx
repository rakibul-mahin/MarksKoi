"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import { SidebarLinks } from "./nav-links";
import type { NavItem } from "./nav";

export function MobileNav({ items, areaLabel }: { items: NavItem[]; areaLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label="Open navigation" className="lg:hidden">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle asChild>
            <div>
              <Logo />
              <p className="mt-1 text-xs font-normal text-muted-foreground">{areaLabel}</p>
            </div>
          </SheetTitle>
        </SheetHeader>
        <nav aria-label={`${areaLabel} navigation`} className="p-3">
          <SidebarLinks items={items} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

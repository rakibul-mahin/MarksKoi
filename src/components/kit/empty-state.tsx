import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ledger-ruling flex flex-col items-center rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center", className)}>
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="font-display text-lg">{title}</h2>
      {children && <div className="mt-1.5 max-w-md text-sm text-muted-foreground text-pretty">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

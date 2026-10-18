import { cn } from "@/lib/utils";

/** Mark: two ruled gradebook rows, the lower one highlighted, like "your line" on the sheet. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7 shrink-0", className)}>
      <rect x="1" y="1" width="30" height="30" rx="8" className="fill-primary" />
      <rect x="7" y="9" width="18" height="3" rx="1.5" className="fill-primary-foreground/45" />
      <rect x="6" y="16.5" width="20" height="7" rx="2.5" fill="var(--highlight)" transform="rotate(-3 16 20)" />
      <rect x="9" y="18.5" width="11" height="3" rx="1.5" className="fill-[#1c2333]" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && <span className="font-display text-[1.2rem] leading-none tracking-tight">SyncScore</span>}
    </span>
  );
}

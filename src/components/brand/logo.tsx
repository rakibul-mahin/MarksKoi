import { cn } from "@/lib/utils";

/**
 * Wordmark: a magnifying glass scans across "MarksKoi" (revealing it), then rests after the name
 * with the "?" of "Marks koi?" (where are my marks?) seen through its yellow lens.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("logo inline-flex items-center", className)}>
      <span className="logo-word font-display text-[1.2rem] leading-none tracking-tight">
        <span className="logo-text">
          Marks<span className="text-primary">Koi</span>
          {/* The visible "?" is the one inside the lens; this keeps the full name for screen readers. */}
          <span className="sr-only">?</span>
        </span>
        <span className="logo-lens" aria-hidden="true">
          <span className="logo-lens-q">?</span>
        </span>
      </span>
    </span>
  );
}

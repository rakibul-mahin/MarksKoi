"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The student's own mark with a marker swipe that draws in once, staggered by row.
 * Reduced-motion users get the finished highlight immediately (handled in CSS).
 */
export function ScoreMark({ children, index = 0, delayMs, className }: { children: React.ReactNode; index?: number; delayMs?: number; className?: string }) {
  const [state, setState] = useState<"pending" | "done">("pending");
  useEffect(() => {
    const t = setTimeout(() => setState("done"), delayMs ?? 120 + Math.min(index, 12) * 55);
    return () => clearTimeout(t);
  }, [index, delayMs]);
  return (
    <span data-swipe={state} className={cn("highlighter", className)}>
      {children}
    </span>
  );
}

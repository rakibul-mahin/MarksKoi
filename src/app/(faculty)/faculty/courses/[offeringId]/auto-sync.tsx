"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { autoSyncAction } from "@/server/actions/faculty";

/**
 * When a faculty member opens a course and its last sync attempt is older than the interval,
 * sync in the background (the page stays usable) and refresh when done. The server re-checks
 * whether a sync is actually due.
 */
export function AutoSync({ offeringId, due }: { offeringId: string; due: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");
  const started = useRef(false);

  useEffect(() => {
    if (!due || started.current) return;
    started.current = true;
    setState("syncing");
    autoSyncAction(offeringId)
      .then((r) => {
        if (r.ok && r.data.ran) {
          setState("done");
          router.refresh();
          setTimeout(() => setState("idle"), 4000);
        } else {
          setState("idle");
        }
      })
      .catch(() => setState("idle"));
  }, [due, offeringId, router]);

  if (state === "idle") return null;
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
      {state === "syncing" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />}
      {state === "syncing" ? "Checking your sheet for changes…" : "Up to date"}
    </span>
  );
}

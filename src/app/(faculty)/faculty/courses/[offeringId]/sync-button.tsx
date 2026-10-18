"use client";

import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ActionButton } from "@/components/kit/action-button";
import { syncNowAction } from "@/server/actions/faculty";

type Outcome = { status: string; summary: string };

/** "Sync now" with outcome-specific feedback. */
export function ActionButtonSync({ offeringId, size = "sm", variant = "default" }: { offeringId: string; size?: "sm" | "default" | "lg"; variant?: "default" | "outline" }) {
  return (
    <ActionButton
      action={() => syncNowAction(offeringId)}
      size={size}
      variant={variant}
      pendingLabel="Syncing…"
      onDone={(data) => {
        const o = data as Outcome;
        if (o.status === "SUCCEEDED") toast.success("Sync complete", { description: o.summary });
        else if (o.status === "PARTIAL") toast.warning("Synced with problems", { description: o.summary });
        else toast.error(o.status === "VALIDATION_FAILED" ? "Sync needs your review" : "Sync failed", { description: o.summary });
      }}
    >
      <RefreshCw aria-hidden="true" />
      Sync now
    </ActionButton>
  );
}

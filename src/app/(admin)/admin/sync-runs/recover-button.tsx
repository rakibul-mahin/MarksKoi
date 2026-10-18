"use client";

import { ActionButton } from "@/components/kit/action-button";
import { recoverSyncAction } from "@/server/actions/admin";

export function RecoverButton({ offeringId }: { offeringId: string }) {
  return (
    <ActionButton
      size="xs"
      variant="outline"
      action={() => recoverSyncAction(offeringId)}
      confirm={{
        title: "Recover this course's sync?",
        description: <p>This clears the sync lock and closes unfinished runs as interrupted. No marks are changed. Do this only if no sync is genuinely still running.</p>,
        confirmLabel: "Recover",
      }}
    >
      Recover
    </ActionButton>
  );
}

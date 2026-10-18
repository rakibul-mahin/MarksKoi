"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { ActionButton } from "@/components/kit/action-button";
import { setArchivedAction } from "@/server/actions/faculty";

export function ArchiveControls({ offeringId, archived, isOwner }: { offeringId: string; archived: boolean; isOwner: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-xl text-sm text-muted-foreground">
        {archived
          ? "This course is archived: it no longer syncs and can't be edited. Students still see the results that were published."
          : "Archive the course at the end of the semester. Syncing stops and settings become read-only. Published results stay visible to students and nothing is deleted."}
        {!isOwner && " Only the course owner can do this."}
      </p>
      {isOwner &&
        (archived ? (
          <ActionButton variant="outline" action={() => setArchivedAction(offeringId, false)} pendingLabel="Restoring…">
            <ArchiveRestore aria-hidden="true" />
            Restore course
          </ActionButton>
        ) : (
          <ActionButton
            variant="outline"
            action={() => setArchivedAction(offeringId, true)}
            pendingLabel="Archiving…"
            confirm={{
              title: "Archive this course?",
              description: <p>Syncing stops and the course becomes read-only. Students keep seeing the published results. You can restore it later.</p>,
              confirmLabel: "Archive course",
            }}
          >
            <Archive aria-hidden="true" />
            Archive course
          </ActionButton>
        ))}
    </div>
  );
}

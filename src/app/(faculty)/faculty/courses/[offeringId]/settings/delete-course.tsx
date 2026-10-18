"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BusyBar } from "@/components/kit/busy-bar";
import { deleteOfferingAction } from "@/server/actions/faculty";

export function DeleteCourse({ offeringId, confirmText, studentCount, published }: { offeringId: string; confirmText: string; studentCount: number; published: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const matches = typed.trim().toUpperCase() === confirmText.toUpperCase();

  const remove = () =>
    start(async () => {
      setError(null);
      const r = await deleteOfferingAction(offeringId, typed);
      if (!r.ok) return void setError(r.error);
      setOpen(false);
      toast.success(`${confirmText} was permanently deleted`);
      router.push("/faculty/courses");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-destructive/25 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-xl text-sm text-muted-foreground">
        Permanently remove this course, its class list, synced marks, published results and sync history. Students will no longer see it. This can&apos;t be undone. To keep the
        records but stop changes, archive the course instead.
      </p>
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (pending) return;
          setOpen(o);
          setTyped("");
          setError(null);
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            <Trash2 aria-hidden="true" />
            Delete course
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          {pending && <BusyBar label="Deleting course" />}
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmText} permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>This permanently deletes:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    the class list ({studentCount} {studentCount === 1 ? "student" : "students"}) and all synced marks
                  </li>
                  <li>{published ? "the results students can currently see, and all earlier published versions" : "all publication history"}</li>
                  <li>the spreadsheet connection, column choices and sync history</li>
                </ul>
                <p>Your Google Sheet is not touched. Student accounts stay (they may be in other courses). The deletion is recorded in the audit log.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (matches) remove();
            }}
            className="space-y-2"
          >
            <Label htmlFor="delete-confirm">
              Type <span className="tabular font-semibold text-foreground">{confirmText}</span> to confirm
            </Label>
            <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={pending} aria-invalid={!!error} aria-describedby="delete-error" className="tabular" />
            <p id="delete-error" role={error ? "alert" : undefined} className="text-sm text-destructive">
              {error}
            </p>
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={pending}>
                Cancel
              </AlertDialogCancel>
              <Button type="submit" disabled={!matches || pending} className="bg-destructive text-white hover:bg-destructive/90">
                {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {pending ? "Deleting…" : "Delete permanently"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

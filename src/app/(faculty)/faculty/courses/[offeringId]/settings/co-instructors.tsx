"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionButton } from "@/components/kit/action-button";
import { StatusPill } from "@/components/kit/status";
import { addCoInstructorAction, removeCoInstructorAction } from "@/server/actions/faculty";

type Member = { profileId: string; name: string | null; email: string; role: "OWNER" | "INSTRUCTOR" };

export function CoInstructors({ offeringId, canManage, viewerId, members }: { offeringId: string; canManage: boolean; viewerId: string; members: Member[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10">
      <ul className="divide-y divide-rule">
        {members.map((m) => (
          <li key={m.profileId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {m.name ?? m.email}
                {m.profileId === viewerId && <span className="font-normal text-muted-foreground"> (you)</span>}
              </span>
              <span className="tabular block truncate text-xs text-muted-foreground">{m.email}</span>
            </span>
            <StatusPill tone={m.role === "OWNER" ? "info" : "neutral"}>{m.role === "OWNER" ? "Owner" : "Co-instructor"}</StatusPill>
            {canManage && m.role !== "OWNER" && (
              <ActionButton
                variant="ghost"
                size="sm"
                action={() => removeCoInstructorAction(offeringId, m.profileId)}
                confirm={{ title: "Remove co-instructor?", description: <p>{m.email} will no longer be able to manage this course.</p>, confirmLabel: "Remove", destructive: true }}
              >
                Remove
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <form
          className="flex flex-col gap-2 border-t border-rule px-5 py-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const r = await addCoInstructorAction(offeringId, email);
              if (!r.ok) return void setError(r.error);
              toast.success("Co-instructor added");
              setEmail("");
              router.refresh();
            });
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="co-email" className="text-xs text-muted-foreground">
              Faculty email
            </Label>
            <Input id="co-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@bracu.ac.bd" aria-describedby="co-email-error" aria-invalid={!!error} required />
          </div>
          <Button type="submit" variant="outline" disabled={pending || !email}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
            Add co-instructor
          </Button>
        </form>
      )}
      {error && (
        <p id="co-email-error" role="alert" className="px-5 pb-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

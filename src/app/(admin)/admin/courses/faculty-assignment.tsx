"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionButton } from "@/components/kit/action-button";
import { assignFacultyAction, removeFacultyAction } from "@/server/actions/admin";

type Member = { profileId: string; label: string; email: string; role: "OWNER" | "INSTRUCTOR" };

export function FacultyAssignment({ offeringId, members }: { offeringId: string; members: Member[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OWNER" | "INSTRUCTOR">("INSTRUCTOR");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <ul className="space-y-2 text-sm">
        {members.map((m) => (
          <li key={m.profileId} className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1">
              {m.label} <span className="text-muted-foreground">· {m.email} · {m.role === "OWNER" ? "owner" : "co-instructor"}</span>
            </span>
            <ActionButton
              size="xs"
              variant="ghost"
              action={() => removeFacultyAction(offeringId, m.profileId)}
              confirm={{ title: "Remove this instructor?", description: <p>{m.email} loses access to manage this course.</p>, confirmLabel: "Remove", destructive: true }}
            >
              Remove
            </ActionButton>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await assignFacultyAction(offeringId, email, role);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Instructor assigned");
            setEmail("");
            router.refresh();
          });
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`assign-${offeringId}`} className="text-xs text-muted-foreground">
            Faculty email
          </Label>
          <Input id={`assign-${offeringId}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@bracu.ac.bd" />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="sm:w-40" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INSTRUCTOR">Co-instructor</SelectItem>
            <SelectItem value="OWNER">Owner</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" disabled={pending || !email}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Assign
        </Button>
      </form>
    </div>
  );
}

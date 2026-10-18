"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function PreviewControls({ roster, studentId, mode }: { roster: Array<{ id: string; label: string }>; studentId: string; mode: "draft" | "published" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (key: string, value: string) =>
    start(() => {
      const next = new URLSearchParams(params.toString());
      next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="preview-student" className="text-xs text-muted-foreground">
          Student
        </Label>
        <Select value={studentId} onValueChange={(v) => set("student", v)}>
          <SelectTrigger id="preview-student" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roster.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ToggleGroup type="single" variant="outline" value={mode} onValueChange={(v) => v && set("mode", v)} aria-label="Preview source">
        <ToggleGroupItem value="draft">Draft (your selection)</ToggleGroupItem>
        <ToggleGroupItem value="published">Live now</ToggleGroupItem>
      </ToggleGroup>
      {pending && <Loader2 className="size-4 animate-spin self-center text-muted-foreground" aria-label="Updating preview" />}
    </div>
  );
}

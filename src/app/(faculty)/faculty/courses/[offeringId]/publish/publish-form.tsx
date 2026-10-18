"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EyeOff, Globe2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/kit/action-button";
import { publishAction, unpublishAction } from "@/server/actions/faculty";

type Group = { name: string; items: Array<{ id: string; name: string; scored: number }> };

export function PublishForm({
  offeringId,
  canPublish,
  hasActive,
  enrollmentCount,
  groups,
  initialSelection,
}: {
  offeringId: string;
  canPublish: boolean;
  hasActive: boolean;
  enrollmentCount: number;
  groups: Group[];
  initialSelection: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const all = groups.flatMap((g) => g.items.map((i) => i.id));
  const [selected, setSelected] = useState(() => new Set(initialSelection.filter((id) => all.includes(id))));
  const [note, setNote] = useState("");
  const lastSynced = useRef([...initialSelection].sort().join(","));

  // Keep the student preview in step with the checklist (debounced URL update, only on change).
  useEffect(() => {
    const key = [...selected].sort().join(",");
    if (key === lastSynced.current) return;
    lastSynced.current = key;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      next.set("a", [...selected].join(","));
      next.set("mode", "draft");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <div className="space-y-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex gap-2 text-sm">
        <Button variant="link" className="h-auto px-0" onClick={() => setSelected(new Set(all))} disabled={!canPublish}>
          Select all
        </Button>
        <span className="text-muted-foreground">·</span>
        <Button variant="link" className="h-auto px-0" onClick={() => setSelected(new Set())} disabled={!canPublish}>
          Clear
        </Button>
      </div>
      <fieldset className="space-y-4" disabled={!canPublish}>
        <legend className="sr-only">Assessments to publish</legend>
        {groups.map((g) => (
          <div key={g.name}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{g.name}</p>
            <ul className="space-y-1">
              {g.items.map((i) => (
                <li key={i.id} className="flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-muted/50">
                  <Checkbox id={`pub-${i.id}`} checked={selected.has(i.id)} onCheckedChange={(v) => toggle(i.id, v === true)} />
                  <Label htmlFor={`pub-${i.id}`} className="flex-1 cursor-pointer font-normal">
                    {i.name}
                  </Label>
                  <span className="tabular text-xs text-muted-foreground" title="Students with a score entered">
                    {i.scored}/{enrollmentCount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="pub-note" className="text-xs text-muted-foreground">
          Note for your records (optional, not shown to students)
        </Label>
        <Input id="pub-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Midterm marks after re-check" disabled={!canPublish} />
      </div>
      {canPublish ? (
        <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
          <ActionButton
            action={() => publishAction(offeringId, [...selected], note || undefined)}
            disabled={selected.size === 0}
            pendingLabel="Publishing…"
            successMessage={(d) => `Published version ${(d as { version: number }).version}. Students can see it now.`}
            confirm={{
              title: `Publish ${selected.size} ${selected.size === 1 ? "assessment" : "assessments"}?`,
              description: (
                <>
                  <p>All {enrollmentCount} enrolled students will immediately see their own marks for the selected assessments.</p>
                  <p>Unchecked assessments are hidden. You can unpublish at any time.</p>
                </>
              ),
              confirmLabel: "Publish",
            }}
          >
            <Globe2 aria-hidden="true" />
            {hasActive ? "Publish update" : "Publish"}
          </ActionButton>
          {hasActive && (
            <ActionButton
              variant="outline"
              action={() => unpublishAction(offeringId)}
              pendingLabel="Unpublishing…"
              confirm={{
                title: "Unpublish all results?",
                description: <p>Students will see “No results published yet” for this course until you publish again. Synced marks are kept.</p>,
                confirmLabel: "Unpublish",
                destructive: true,
              }}
            >
              <EyeOff aria-hidden="true" />
              Unpublish
            </ActionButton>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This course is archived. Restore it in Settings to publish changes.</p>
      )}
    </div>
  );
}

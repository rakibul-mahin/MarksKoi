"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { offeringUpdateSchema } from "@/lib/schemas";
import { updateOfferingAction } from "@/server/actions/faculty";
import { FieldError } from "../../new/new-course-form";

type In = z.input<typeof offeringUpdateSchema>;
type Out = z.output<typeof offeringUpdateSchema>;

export function SettingsForm({ offeringId, editable, defaults }: { offeringId: string; editable: boolean; defaults: In }) {
  const router = useRouter();
  const { register, handleSubmit, control, formState, setError, reset } = useForm<In, unknown, Out>({ resolver: zodResolver(offeringUpdateSchema), defaultValues: defaults });
  const errors = formState.errors;
  const onSubmit = handleSubmit(async (values) => {
    const r = await updateOfferingAction(offeringId, values);
    if (!r.ok) {
      for (const [k, m] of Object.entries(r.fieldErrors ?? {})) setError(k as keyof In, { message: m });
      return void toast.error(r.error);
    }
    toast.success("Changes saved");
    reset({ ...values, description: values.description ?? "" });
    router.refresh();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <fieldset disabled={!editable} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_8rem]">
          <div className="space-y-2">
            <Label htmlFor="title">Title shown to students</Label>
            <Input id="title" aria-invalid={!!errors.title} aria-describedby="title-error" {...register("title")} />
            <FieldError id="title-error" message={errors.title?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="section">Section</Label>
            <Input id="section" className="tabular" aria-invalid={!!errors.section} aria-describedby="section-error" {...register("section")} />
            <FieldError id="section-error" message={errors.section?.message} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Note for students</Label>
          <Textarea id="description" rows={3} aria-describedby="description-error" {...register("description")} />
          <FieldError id="description-error" message={errors.description?.message} />
        </div>
        {(
          [
            ["scheduledSync", "Sync automatically", "SyncScore checks your sheet every 15 minutes in the background. Turn off if you only want to sync by hand or when you open the course."],
            ["autoPublish", "Republish automatically after clean syncs", "When a sync finds no problems, students see the updated marks for already-published assessments without you clicking Publish. Syncs with problems are never published automatically."],
          ] as const
        ).map(([name, label, help]) => (
          <div key={name} className="flex items-start justify-between gap-6 border-t border-rule pt-5">
            <div>
              <Label htmlFor={name}>{label}</Label>
              <p id={`${name}-help`} className="mt-1 text-sm text-muted-foreground">
                {help}
              </p>
            </div>
            <Controller control={control} name={name} render={({ field }) => <Switch id={name} checked={field.value} onCheckedChange={field.onChange} aria-describedby={`${name}-help`} />} />
          </div>
        ))}
      </fieldset>
      {editable && (
        <div className="flex justify-end border-t border-rule pt-5">
          <Button type="submit" disabled={formState.isSubmitting || !formState.isDirty}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
